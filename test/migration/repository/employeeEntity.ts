import { DynaBridgeEntity } from '../../../src';
import { Employee, EmployeeRole } from '../domain/Employee';

interface EmployeeV1 {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
}

interface EmployeeV2 {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  role: 'Manager' | 'Sales' | 'Human Resources' | 'Other';
}

export const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee-739ab4',
  id: ['companyId', 'employeeNumber'],
  migrations: [
    (v1: EmployeeV1) => ({ ...v1, role: 'Other' }),
    (v2: EmployeeV2) => ({
      ...v2,
      role: (v2.role === 'Human Resources' ? 'HR' : v2.role) as EmployeeRole
    })
  ]
};
