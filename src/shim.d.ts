declare function GM_setValue(key: string, value: any): void;
declare function GM_getValue(key: string, defaultValue?: any): any;
declare function GM_registerMenuCommand(
  name: string,
  func: () => void,
  accessKey?: string
): void;
declare function GM_xmlhttpRequest(args: any): Promise<any>;
