import { BadRequestException, PipeTransform } from '@nestjs/common';

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/** Códigos de catálogo / ids de texto ("PPTO_V1", "GT1", ids de documento IC). */
export class CodeParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !CODE_RE.test(value)) throw new BadRequestException('Identificador inválido');
    return value;
  }
}

export function optionalCode(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !CODE_RE.test(value)) throw new BadRequestException(`${name} inválido`);
  return value;
}
