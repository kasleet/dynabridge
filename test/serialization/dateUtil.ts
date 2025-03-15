const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

export const mapDatesToString = (obj: any): any => {
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => mapDatesToString(item));
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = mapDatesToString(obj[key]);
      }
    }
    return result;
  }

  return obj;
};

export const mapStringsToDate = (obj: any): any => {
  if (typeof obj === 'string' && isoDateRegex.test(obj)) {
    return new Date(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => mapStringsToDate(item));
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = mapStringsToDate(obj[key]);
      }
    }
    return result;
  }

  return obj;
};
