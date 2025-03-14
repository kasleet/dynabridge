import { DynaBridgeEntity } from '../../../src';
import { Employee } from '../domain/Employee';

export const employeeEntity: DynaBridgeEntity<Employee, 'byCountry'> = {
  tableName: 'employee-739ab4',
  id: ['companyId', 'employeeNumber'],
  index: {
    byCountry: {
      indexName: 'employee-country-index-abdc23',
      key: 'country'
    }
  }
};
