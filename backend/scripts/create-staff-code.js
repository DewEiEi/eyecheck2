#!/usr/bin/env node
/**
 * Creates a staff registration code from the command line (admins can also
 * do this in Admin → โค้ดสมัครเจ้าหน้าที่). The plain code is printed once;
 * only its HMAC hash is stored.
 *
 *   npm run create-staff-code -- --label "รพ.สต. บ้านหนองบัว" --limit 20 --expires 2026-12-31
 */
import { getServiceClient } from '../src/config/supabase.js';
import { validateConfig } from '../src/config/env.js';
import { generateRegistrationCode, hashRegistrationCode } from '../src/utils/helpers.js';

const { errors } = validateConfig();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const limit = get('limit') ? Number.parseInt(get('limit'), 10) : null;
const expires = get('expires');
if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) { console.error('--expires must be YYYY-MM-DD'); process.exit(1); }

const code = generateRegistrationCode();
const { error } = await getServiceClient().from('staff_registration_codes').insert({
  code_hash: hashRegistrationCode(code),
  label: get('label') ?? null,
  usage_limit: Number.isFinite(limit) ? limit : null,
  expires_at: expires ? new Date(`${expires}T23:59:59+07:00`).toISOString() : null,
});
if (error) { console.error(error.message); process.exit(1); }
console.log(`\nStaff registration code (shown only once):\n\n   ${code}\n`);
