import fs from 'fs-extra';
import { IFileSystemAdapter } from '../ports/FileSystemAdapter.js';

export class DefaultFileSystemAdapter implements IFileSystemAdapter {
  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    return encoding
      ? fs.readFile(filePath, encoding)
      : fs.readFile(filePath, 'utf-8');
  }

  readFileSync(filePath: string, encoding?: BufferEncoding): string {
    return encoding
      ? fs.readFileSync(filePath, encoding)
      : fs.readFileSync(filePath, 'utf-8');
  }

  async writeFile(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<void> {
    return encoding
      ? fs.writeFile(filePath, data, encoding)
      : fs.writeFile(filePath, data);
  }

  writeFileSync(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): void {
    return encoding
      ? fs.writeFileSync(filePath, data, encoding)
      : fs.writeFileSync(filePath, data);
  }

  async appendFile(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<void> {
    return encoding
      ? fs.appendFile(filePath, data, encoding)
      : fs.appendFile(filePath, data);
  }

  appendFileSync(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): void {
    return encoding
      ? fs.appendFileSync(filePath, data, encoding)
      : fs.appendFileSync(filePath, data);
  }

  async pathExists(filePath: string): Promise<boolean> {
    return fs.pathExists(filePath);
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    return fs.ensureDir(dirPath);
  }

  ensureDirSync(dirPath: string): void {
    return fs.ensureDirSync(dirPath);
  }

  async ensureFile(filePath: string): Promise<void> {
    return fs.ensureFile(filePath);
  }

  ensureFileSync(filePath: string): void {
    return fs.ensureFileSync(filePath);
  }

  async remove(filePath: string): Promise<void> {
    return fs.remove(filePath);
  }

  removeSync(filePath: string): void {
    return fs.removeSync(filePath);
  }

  async copy(
    src: string,
    dest: string,
    options?: fs.CopyOptions
  ): Promise<void> {
    return fs.copy(src, dest, options);
  }

  copySync(src: string, dest: string, options?: fs.CopyOptionsSync): void {
    return fs.copySync(src, dest, options);
  }

  async stat(filePath: string): Promise<fs.Stats> {
    return fs.stat(filePath);
  }

  statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  readdirSync(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }
}
