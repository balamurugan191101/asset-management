import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AdminpageRoutingModule } from './adminpage-routing-module';
import { Home } from './home/home';
import { Adminpage } from './adminpage';
import { UserList } from './create-user/create-user';
import { CreateUserForm } from './create-user-form/create-user-form';
import { Assets } from './assets/assets';
import { AssetCategoryPage } from './assets/category-page';
import { Maintenance } from './maintenance/maintenance';


@NgModule({
  declarations: [
    Home,
    Adminpage,
    UserList,
    CreateUserForm,
    Assets,
    AssetCategoryPage
  ],
  imports: [
    CommonModule,
    AdminpageRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    Maintenance
  ]
})
export class AdminpageModule { }
