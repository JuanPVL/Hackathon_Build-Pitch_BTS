import { connectionOptions } from '../../src/db/user-db';

describe('connectionOptions', () => {
  it('en local usa max 5, sin TLS, y apaga prepared statements solo en el puerto 6543', () => {
    const session = connectionOptions('postgres://postgres@127.0.0.1:5432/quadra_test');
    expect(session.max).toBe(5);
    expect(session.ssl).toBe(false);
    expect(session.prepare).not.toBe(false);

    const txn = connectionOptions('postgres://postgres@localhost:6543/quadra_test');
    expect(txn.max).toBe(5);
    expect(txn.ssl).toBe(false);
    expect(txn.prepare).toBe(false);
  });

  it('hacia el pooler de Supabase exige TLS con certificado válido', () => {
    const opts = connectionOptions(
      'postgresql://postgres.ref:secret@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
    );
    expect(opts.max).toBe(5);
    expect(opts.ssl).toEqual({ rejectUnauthorized: true });
    expect(opts.prepare).not.toBe(false);
  });
});
