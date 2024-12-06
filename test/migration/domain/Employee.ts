type EmployeeRole = 'Manager' | 'Sales' | 'Developer' | 'HR' | 'Other'

interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
}

export { Employee, EmployeeRole }
