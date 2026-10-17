const express = require('express');
const bodyparser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();


// Load the server configuration regardless of the current working directory.
require('dotenv').config({ path: path.join(__dirname, '.env') });

app.use(bodyparser.json());
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        // Requests without an Origin header are useful for local tools and server-to-server calls.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS'));
    },
}));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0
});

db.query(
    'ALTER TABLE user_details MODIFY COLUMN s_no INT NOT NULL AUTO_INCREMENT',
    (schemaError) => {
        if (schemaError) {
            console.error('User table schema update failed:', schemaError.message);
        }
    }
);

db.query(`
    CREATE TABLE IF NOT EXISTS user_password_reset_tokens (
        token_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`, (error) => {
    if (error) {
        console.error('Reset token table setup failed:', error.message);
    }
});
app.get('/hrlogin', (req, res) => {
    res.send('welcome');
});

const port = 3000;
const loginUrl = process.env.LOGIN_URL || 'http://localhost:4200/login';
const resetTokenLifetimeMs = 24 * 60 * 60 * 1000;
const mailer = process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER.trim(),
            pass: process.env.EMAIL_PASS.replace(/\s+/g, ''),
        },
    })
    : null;

function createResetToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + resetTokenLifetimeMs);

    return new Promise((resolve, reject) => {
        db.query(
            'INSERT INTO user_password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [userId, tokenHash, expiresAt],
            (error) => error ? reject(error) : resolve(token)
        );
    });
}

function sendPasswordEmail(user, token, subject, intro) {
    if (!mailer) {
        console.warn('Password email not sent: EMAIL_USER and EMAIL_PASS are not configured');
        return Promise.resolve(false);
    }

    const resetUrl = `${loginUrl}?resetToken=${encodeURIComponent(token)}`;
    return mailer.sendMail({
        from: process.env.EMAIL_USER.trim(),
        to: user.email,
        subject,
        text: `Hello ${user.firstName},\n\n${intro}\n\nLogin page: ${resetUrl}\n\nThis link expires in 24 hours and can be used only once.`,
        html: `<p>Hello ${user.firstName},</p><p>${intro}</p><p><a href="${resetUrl}">Set or reset your password</a></p><p>This link expires in 24 hours and can be used only once.</p>`,
    }).then(() => true);
}

function sendNewUserEmail(user, token) {
    return sendPasswordEmail(
        user,
        token,
        'Set up your asset management account',
        'Your account has been created. Use the link below to set your password and access the login page.'
    );
}

function sendResetPasswordEmail(user, token) {
    return sendPasswordEmail(
        user,
        token,
        'Reset your asset management password',
        'We received a request to reset your password.'
    );
}

function findUserByLogin(login) {
    return new Promise((resolve, reject) => {
        db.query(
            `SELECT s_no AS id, first_name AS firstName, emailid AS email
             FROM user_details
             WHERE LOWER(TRIM(emailid)) = LOWER(?) OR TRIM(emp_code) = ? OR LOWER(TRIM(username)) = LOWER(?)
             LIMIT 1`,
            [login, login, login],
            (error, results) => error ? reject(error) : resolve(results[0])
        );
    });
}

function findValidResetToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return new Promise((resolve, reject) => {
        db.query(
            `SELECT token_id, user_id FROM user_password_reset_tokens
             WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
            [tokenHash],
            (error, results) => error ? reject(error) : resolve({ tokenHash, token: results[0] })
        );
    });
}

app.post('/login', async (req, res) => {
    const email = req.body.email?.trim();
    const password = req.body.password;
    if (!email || typeof password !== 'string') {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM user_details WHERE emailid = ? OR username = ? LIMIT 1',
                [email, email],
                (error, rows) => error ? reject(error) : resolve(rows)
            );
        });
        const user = results[0];
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const storedPassword = user.password || '';
        const passwordMatches = storedPassword.startsWith('$2')
            ? await bcrypt.compare(password, storedPassword)
            : password === storedPassword;
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Upgrade legacy plain-text records after their first successful login.
        if (!storedPassword.startsWith('$2')) {
            const passwordHash = await bcrypt.hash(password, 12);
            await new Promise((resolve, reject) => {
                db.query('UPDATE user_details SET password = ? WHERE s_no = ?', [passwordHash, user.s_no],
                    (error) => error ? reject(error) : resolve());
            });
        }

        const { password: _password, ...safeUser } = user;
        return res.status(200).json({ message: 'Login successful', user: safeUser });
    } catch (error) {
        console.error('Login failed:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/reset', async (req, res) => {
    const login = req.body.username?.trim();

    if (login) {
        try {
            const user = await findUserByLogin(login);
            if (user) {
                const token = await createResetToken(user.id);
                sendResetPasswordEmail(user, token).catch((error) => {
                    console.error('Password reset email could not be sent:', error.message);
                });
            }
        } catch (error) {
            console.error('Password reset request failed:', error.message);
        }
    }

    return res.status(200).json({ message: 'If the account exists, a reset link has been sent.' });
});

app.post('/reset-password', async (req, res) => {
    const token = req.body.token?.trim();
    const password = req.body.password?.trim();

    if (!token || !password || password.length < 6) {
        return res.status(400).json({ message: 'A valid token and password of at least 6 characters are required' });
    }

    try {
        const { tokenHash, token: resetToken } = await findValidResetToken(token);
        if (!resetToken) {
            return res.status(410).json({ message: 'This password link has expired or was already used.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        await new Promise((resolve, reject) => {
            db.query('UPDATE user_details SET password = ? WHERE s_no = ?', [passwordHash, resetToken.user_id], (error) => {
                if (error) return reject(error);
                db.query(
                    'UPDATE user_password_reset_tokens SET used_at = NOW() WHERE token_hash = ?',
                    [tokenHash],
                    (tokenError) => tokenError ? reject(tokenError) : resolve()
                );
            });
        });

        return res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Password reset failed:', error.message);
        return res.status(500).json({ message: 'Unable to reset password' });
    }
});

app.get('/users', (req, res) => {
    const query = `
    SELECT s_no AS id, First_name AS firstName, last_name AS lastName,
            CONCAT(First_name, ' ', last_name) AS name,
               emailid AS email, emp_code AS employeeId, role, department, status
        FROM user_details
     ORDER BY s_no DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error loading users:', err.message);
            return res.status(500).json({ message: 'Unable to load users' });
        }

        return res.status(200).json(results);
    });
});

app.post('/users', (req, res) => {
    const firstName = req.body.firstName ?? req.body.first_name;
    const lastName = req.body.lastName ?? req.body.last_name;
    const email = req.body.email ?? req.body.emailid;
    const password = req.body.password;
    const employeeId = req.body.employeeId ?? req.body.emp_code;
    const { role } = req.body;
    const department = req.body.department;
    const normalizedFirstName = firstName?.trim();
    const normalizedLastName = lastName?.trim();
    const normalizedEmail = email?.trim();
    const normalizedPassword = password?.trim();
    const normalizedEmployeeId = employeeId?.trim();
    const normalizedDepartment = department?.trim();

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedPassword || normalizedPassword.length < 6 || !normalizedEmployeeId || !normalizedDepartment) {
        return res.status(400).json({ message: 'First name, last name, email, password, employee ID, and department are required' });
    }

    const duplicateCheck = `
        SELECT
            EXISTS(SELECT 1 FROM user_details WHERE LOWER(TRIM(emailid)) = LOWER(?) LIMIT 1) AS emailExists,
            EXISTS(SELECT 1 FROM user_details WHERE TRIM(emp_code) = ? LIMIT 1) AS employeeIdExists
    `;

    db.query(duplicateCheck, [normalizedEmail, normalizedEmployeeId], async (checkError, duplicateResult) => {
        if (checkError) {
            console.error('Error checking existing user:', checkError.message);
            return res.status(500).json({ message: 'Unable to create user' });
        }

        const duplicate = duplicateResult[0];
        const duplicateFields = [];
        if (duplicate.emailExists) {
            duplicateFields.push('email');
        }
        if (duplicate.employeeIdExists) {
            duplicateFields.push('employee ID');
        }

        if (duplicateFields.length > 0) {
            return res.status(409).json({
                message: `A user with this ${duplicateFields.join(' and ')} already exists. Use a different value.`,
            });
        }

        const passwordHash = await bcrypt.hash(normalizedPassword, 12);
        const values = [normalizedFirstName, normalizedLastName, normalizedEmail, passwordHash, normalizedEmployeeId, role || 'Technician', normalizedDepartment, 'Active'];
        const query = `
            INSERT INTO user_details
                (First_name, last_name, emailid, password, emp_code, role, department, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(query, values, (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    console.error('Duplicate user value:', err.sqlMessage || err.message);
                    const duplicateField = err.message.includes('emailid') ? 'Email' :
                        err.message.includes('emp_code') ? 'Employee ID' : 'User value';
                    return res.status(409).json({ message: `${duplicateField} already exists` });
                }

                console.error('Error creating user:', err.message);
                return res.status(500).json({ message: 'Unable to create user' });
            }

        const createdUser = {
            id: result.insertId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            name: `${firstName.trim()} ${lastName.trim()}`,
            email: email.trim(),
            employeeId: employeeId.trim(),
            role: role || 'Technician',
            department: department.trim(),
            status: 'Active'
        };

        createResetToken(createdUser.id).then((token) => sendNewUserEmail(createdUser, token)).catch((mailError) => {
            console.error('User created, but setup email could not be sent:', mailError.message);
        });

            return res.status(201).json(createdUser);
        });
    });
});

app.delete('/users/:id', (req, res) => {
    db.query('DELETE FROM user_details WHERE s_no = ?', [req.params.id], (err, result) => {
        if (err) {
            console.error('Error deleting user:', err.message);
            return res.status(500).json({ message: 'Unable to delete user' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(204).send();
    });
});



db.query(`
    CREATE TABLE IF NOT EXISTS assets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        machine_name VARCHAR(255) NULL,
        product_name VARCHAR(255) NULL,
        make VARCHAR(100) NULL,
        model VARCHAR(100) NULL,
        serial_number VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NULL,
        category VARCHAR(100) NOT NULL,
        status ENUM('Operational', 'Under Maintenance', 'Decommissioned', 'In Storage') NOT NULL DEFAULT 'Operational',
        assigned_to VARCHAR(255) NULL,
        location VARCHAR(255) NULL,
        next_maintenance_date DATE NOT NULL,
        import_group_key VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`, (error) => {
    if (error) console.error('Asset table setup failed:', error.message);
});

// --- Asset API Endpoints ---

app.get('/assets', (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 0;
    const offset = (page - 1) * limit;

    let query = `
        SELECT id, name, machine_name AS machineName, product_name AS productName,
               make, model, serial_number AS serialNumber, ip_address AS ipAddress,
               category, status, assigned_to AS assignedTo, location,
               next_maintenance_date AS nextMaintenanceDate, import_group_key AS importGroupKey
        FROM assets ORDER BY id DESC
    `;

    if (limit > 0) {
        query += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching assets:', err.message);
            return res.status(500).json({ message: 'Unable to fetch assets' });
        }
        return res.status(200).json(results);
    });
});

app.post('/assets', (req, res) => {
    const { name, machineName, productName, make, model, serialNumber, ipAddress, category, status, assignedTo, location, nextMaintenanceDate, importGroupKey } = req.body;

    if (!name || !serialNumber || !category) {
        return res.status(400).json({ message: 'Name, serial number, and category are required' });
    }

    const query = `
        INSERT INTO assets (name, machine_name, product_name, make, model, serial_number, ip_address, category, status, assigned_to, location, next_maintenance_date, import_group_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [name, machineName || name, productName, make, model, serialNumber, ipAddress, category, status || 'Operational', assignedTo, location, nextMaintenanceDate ? new Date(nextMaintenanceDate) : new Date(), importGroupKey];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error creating asset:', err.message);
            return res.status(500).json({ message: 'Unable to create asset' });
        }
        return res.status(201).json({ id: result.insertId, ...req.body });
    });
});

app.post('/assets/bulk', async (req, res) => {
    const assets = req.body;
    if (!Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ message: 'Payload must be a non-empty array' });
    }

    // Extract unique machine names from incoming payload
    const machineNames = [...new Set(assets.map(a => a.machineName || a.name).filter(Boolean))];

    // Delete existing assets matching incoming machine names
    const deleteQuery = `DELETE FROM assets WHERE machine_name IN (?)`;
    
    db.query(deleteQuery, [machineNames], (delErr) => {
        if (delErr) {
            console.error('Error clearing old records:', delErr.message);
            return res.status(500).json({ message: 'Failed to clear duplicate records' });
        }

        // Insert new/updated items
        const insertQuery = `
            INSERT INTO assets 
            (name, machine_name, product_name, make, model, serial_number, ip_address, category, status, assigned_to, location, next_maintenance_date, import_group_key)
            VALUES ?
        `;

        const values = assets.map((asset) => [
            asset.name || asset.machineName || 'Imported Asset',
            asset.machineName || asset.name || 'Imported Asset',
            asset.productName || 'N/A',
            asset.make || 'N/A',
            asset.model || 'N/A',
            asset.serialNumber || 'N/A',
            asset.ipAddress || 'N/A',
            asset.category || 'Peripheral',
            asset.status || 'Operational',
            asset.assignedTo || 'N/A',
            asset.location || 'N/A',
            asset.nextMaintenanceDate ? new Date(asset.nextMaintenanceDate) : new Date(),
            asset.importGroupKey || null,
        ]);

        db.query(insertQuery, [values], (insErr, result) => {
            if (insErr) {
                console.error('Error inserting assets:', insErr.message);
                return res.status(500).json({ message: 'Failed to insert updated assets' });
            }

            return res.status(200).json({
                message: 'Assets updated successfully',
                insertedCount: result.affectedRows
            });
        });
    });
});

app.patch('/assets/:id/status', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
        return res.status(400).json({ message: 'Status is required' });
    }

    const query = 'UPDATE assets SET status = ? WHERE id = ?';
    db.query(query, [status, id], (err, result) => {
        if (err) {
            console.error('Error updating asset status:', err.message);
            return res.status(500).json({ message: 'Unable to update status' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        return res.status(200).json({ message: 'Status updated successfully' });
    });
});

app.delete('/assets/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM assets WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting asset:', err.message);
            return res.status(500).json({ message: 'Unable to delete asset' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        return res.status(204).send();
    });
});


app.patch('/assets/group-status', async (req, res) => {
  const { machineName, status } = req.body;
  
  // Update all records where machineName matches
  await AssetModel.updateMany(
    { $or: [{ machineName }, { name: machineName }] },
    { $set: { status } }
  );

  res.status(200).json({ message: 'Group status updated successfully' });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
