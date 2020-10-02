type TDictionary<TKey extends number | string, TValue> = TKey extends number ? {[key: number]: TValue} : {[key: string]: TValue};
