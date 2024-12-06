import { DynaBridgeEntity } from '../../../src';
import { Employee } from '../domain/Employee';

export const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee-739ab4',
  id: ['companyId', 'employeeNumber']
};
