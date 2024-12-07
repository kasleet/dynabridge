type SimpleID = string | number;

type ComplexID = (string | number)[];

type ID = SimpleID | ComplexID;

type Migrations<T> = [...((e: any) => any)[], (e: any) => T] | ((e: any) => T);

type DynaBridgeEntity<T = any> = {
  tableName: string;
  id: Extract<keyof T, string> | Extract<keyof T, string>[];
  migrations?: Migrations<T>;
};

export { DynaBridgeEntity, ID, Migrations, SimpleID };
