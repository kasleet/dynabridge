import { DynaBridgeEntity } from '../../../src';
import { Company } from '../domain/Company';

interface CompanyV1 {
  id: string;
  name: string;
}

export const companyEntity: DynaBridgeEntity<Company> = {
  tableName: 'company-739ab4',
  id: "id",
  migrations: (v1: CompanyV1) => ({ ...v1, industry: 'Other' })
};
