import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { Adminpage } from './adminpage';

describe('Adminpage', () => {
  let component: Adminpage;
  let fixture: ComponentFixture<Adminpage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Adminpage],
      imports: [CommonModule, RouterModule.forRoot([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Adminpage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
