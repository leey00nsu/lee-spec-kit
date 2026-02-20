export interface IFileSystemAdapter {
  readFile(filePath: string, encoding?: BufferEncoding): Promise<string>;
  readFileSync(filePath: string, encoding?: BufferEncoding): string;
  writeFile(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<void>;
  writeFileSync(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): void;
  appendFile(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<void>;
  appendFileSync(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): void;
  pathExists(filePath: string): Promise<boolean>;
  existsSync(filePath: string): boolean;
  ensureDir(dirPath: string): Promise<void>;
  ensureDirSync(dirPath: string): void;
  ensureFile(filePath: string): Promise<void>;
  ensureFileSync(filePath: string): void;
  remove(filePath: string): Promise<void>;
  removeSync(filePath: string): void;
  copy(src: string, dest: string, options?: any): Promise<void>;
  copySync(src: string, dest: string, options?: any): void;
  stat(filePath: string): Promise<any>;
  statSync(filePath: string): any;
  readdir(dirPath: string): Promise<string[]>;
  readdirSync(dirPath: string): string[];
}
