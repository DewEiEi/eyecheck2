import { z } from 'zod';

const today = () => new Date().toISOString().slice(0, 10);

export const isoDate = z
  .string({ required_error: 'กรุณาระบุวันที่' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), 'วันที่ไม่ถูกต้อง');

export const birthDate = isoDate
  .refine((s) => s <= today(), 'วันเกิดต้องไม่เป็นวันในอนาคต')
  .refine((s) => s > '1900-01-01', 'วันเกิดไม่ถูกต้อง');

export const uuid = z.string().uuid('รหัสอ้างอิงไม่ถูกต้อง');
export const gender = z.enum(['male', 'female', 'other', 'unspecified'], { errorMap: () => ({ message: 'กรุณาเลือกเพศ' }) });
export const fullName = z.string().trim().min(2, 'ชื่อ-นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร').max(150, 'ชื่อ-นามสกุลยาวเกินไป');
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, 'ชื่อบัญชีต้องเป็น a-z, 0-9, _ หรือ . ความยาว 3–30 ตัว');
export const password = z
  .string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .max(72, 'รหัสผ่านยาวเกินไป')
  .regex(/[A-Za-z]/, 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษ')
  .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลข');

const boolish = z.union([z.boolean(), z.enum(['true', 'false', '1', '0', 'on'])]).transform((v) => v === true || v === 'true' || v === '1' || v === 'on');

// ---------------- auth ----------------
const registerBase = {
  full_name: fullName,
  username,
  password,
  confirm_password: z.string(),
  accept_terms: z.literal(true, { errorMap: () => ({ message: 'กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว' }) }),
};
export const registerSchema = z
  .discriminatedUnion('account_type', [
    z.object({ account_type: z.literal('personal'), ...registerBase, birth_date: birthDate, gender }),
    z.object({
      account_type: z.literal('staff'),
      ...registerBase,
      position: z.string().trim().min(2, 'กรุณาระบุตำแหน่ง').max(120),
      workplace: z.string().trim().min(2, 'กรุณาระบุสถานที่ทำงาน').max(200),
      registration_code: z.string().trim().min(6, 'กรุณากรอกโค้ดสมัครบัญชีเจ้าหน้าที่').max(64),
    }),
  ], { errorMap: () => ({ message: 'กรุณาเลือกประเภทบัญชี' }) })
  .refine((d) => d.password === d.confirm_password, { message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', path: ['confirm_password'] });

export const loginSchema = z.object({
  username,
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน').max(72),
  remember: z.boolean().optional().default(false),
});

export const changePasswordSchema = z
  .object({ current_password: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'), new_password: password, confirm_password: z.string() })
  .refine((d) => d.new_password === d.confirm_password, { message: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', path: ['confirm_password'] });

export const updateProfileSchema = z
  .object({
    full_name: fullName.optional(),
    birth_date: birthDate.optional(),
    gender: gender.optional(),
    position: z.string().trim().min(2).max(120).optional(),
    workplace: z.string().trim().min(2).max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'ไม่มีข้อมูลที่ต้องการแก้ไข');

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'กรุณากรอกรหัสผ่านเพื่อยืนยัน'),
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'กรุณาพิมพ์ DELETE เพื่อยืนยัน' }) }),
});

// ---------------- patients ----------------
export const patientSchema = z
  .object({
    full_name: fullName,
    birth_date: birthDate,
    age: z.coerce.number().int('อายุต้องเป็นจำนวนเต็ม').min(0, 'อายุไม่ถูกต้อง').max(130, 'อายุไม่ถูกต้อง'),
    gender,
    notes: z.string().trim().max(1000).optional().nullable(),
  });

export const listQuery = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------- medical history ----------------
export const SYMPTOM_KEYS = ['blurry_cloudy', 'glare_halos', 'peripheral_loss', 'irritation', 'tissue_growth'];
export const medicalHistorySchema = z.object({
  patient_id: uuid.optional().nullable(),
  age_group: z.enum(['under_40', '40_59', '60_plus'], { errorMap: () => ({ message: 'กรุณาเลือกช่วงอายุ' }) }),
  family_glaucoma_history: z.boolean().default(false),
  diabetes: z.boolean().default(false),
  hypertension: z.boolean().default(false),
  steroid_use: z.boolean().default(false),
  outdoor_exposure: z.boolean().default(false),
  high_myopia: z.boolean().default(false),
  eye_injury: z.boolean().default(false),
  eye_symptoms: z.array(z.enum(SYMPTOM_KEYS)).max(5).default([]).transform((a) => [...new Set(a)]),
  emergency_symptoms: z.boolean().default(false),
});

// ---------------- vision tests ----------------
const testStatus = z.enum(['completed', 'skipped', 'not_tested']);
const num = (min, max) => z.number().min(min).max(max).nullable().optional();
const eyeEntry = (shape) => z.object({ status: testStatus, ...shape }).strict();
const perEye = (shape, extra = {}) => z.object({ right: eyeEntry(shape), left: eyeEntry(shape), ...extra }).strict().nullable().optional();

export const visionTestSchema = z.object({
  patient_id: uuid.optional().nullable(),
  visual_acuity: perEye(
    { logmar: num(-0.3, 1.5), snellen: z.string().max(12).nullable().optional(), trials: num(0, 200) },
    { distance_cm: num(30, 600), calibrated: z.boolean().optional(), px_per_mm: num(0.5, 50) },
  ),
  color_vision: perEye({ correct: num(0, 50), total: num(0, 50), control_passed: z.boolean().nullable().optional() }),
  central_visual_field: perEye({
    sees_center: z.boolean().nullable().optional(),
    lines_straight: z.boolean().nullable().optional(),
    missing_areas: z.boolean().nullable().optional(),
    marked_cells: z.array(z.number().int().min(0).max(399)).max(400).optional(),
  }),
  visual_field: perEye({
    quadrants: z.record(z.enum(['upper_left', 'upper_right', 'lower_left', 'lower_right']), z.object({ shown: z.number().int().min(0).max(50), seen: z.number().int().min(0).max(50) })).optional(),
    catch_trials: num(0, 50),
    false_positives: num(0, 50),
  }),
  near_vision: perEye({ logmar: num(-0.3, 1.5), smallest_size_mm: num(0, 100) }, { distance_cm: num(20, 100) }),
  contrast_sensitivity: perEye({ logcs: num(0, 2.5) }),
});

// ---------------- screenings ----------------
export const createScreeningSchema = z.object({
  eye_side: z.enum(['left', 'right'], { errorMap: () => ({ message: 'กรุณาเลือกตาข้างที่ตรวจ' }) }),
  patient_id: uuid.optional().nullable().or(z.literal('').transform(() => null)),
  medical_history_id: uuid,
  vision_test_id: uuid.optional().nullable().or(z.literal('').transform(() => null)),
  dataset_consent: boolish.default(false),
  consent_version: z.string().max(20).optional(),
});

export const screeningListQuery = listQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  disease: z.enum(['cataract', 'pterygium', 'pinguecula', 'glaucoma', 'normal', 'no_finding', 'inconclusive']).optional(),
  risk: z.enum(['low', 'moderate', 'high', 'urgent', 'inconclusive']).optional(),
  patient_id: uuid.optional(),
  saved: z.enum(['all', 'saved', 'draft']).optional().default('all'),
  sort: z.enum(['screening_date', 'screening_code', 'risk_level', 'primary_finding']).optional().default('screening_date'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const analyzeSchema = z.object({ screening_id: uuid });

// ---------------- dashboards ----------------
export const dashboardQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  disease: z.enum(['cataract', 'pterygium', 'pinguecula', 'glaucoma']).optional(),
  count_by: z.enum(['screening', 'person']).optional().default('screening'),
});

// ---------------- activity ----------------
export const trackSchema = z.object({
  event: z.enum(['page_view', 'page_leave']),
  path: z.string().max(200).regex(/^\/[\w\-./]*$/, 'invalid path'),
});

// ---------------- admin ----------------
export const adminUsersQuery = listQuery.extend({
  account_type: z.enum(['personal', 'staff']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});
export const userStatusSchema = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().max(300).optional() });
export const userRoleSchema = z.object({ role: z.enum(['user', 'admin']) });
export const activityQuery = listQuery.extend({ from: isoDate.optional(), to: isoDate.optional(), action: z.string().max(60).optional() });
export const statsQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export const regCodeSchema = z.object({
  label: z.string().trim().max(120).optional(),
  usage_limit: z.number().int().min(1).max(10000).nullable().optional(),
  expires_at: isoDate.nullable().optional(),
});
export const regCodeUpdateSchema = z.object({ status: z.enum(['active', 'disabled']) });

export const settingsSchema = z.object({
  ai_confidence_threshold: z.object({
    value: z.number().min(0.05).max(0.99),
    validated: z.boolean(),
    note: z.string().max(500).optional(),
  }).optional(),
}).strict();

export const activeModelSchema = z.object({
  workspace: z.string().trim().min(1).max(100).regex(/^[\w\-]+$/, 'workspace ไม่ถูกต้อง'),
  project: z.string().trim().min(1).max(100).regex(/^[\w\-]+$/, 'project ไม่ถูกต้อง'),
  version: z.coerce.number().int().min(1).max(100000),
});

const datasetClass = z.enum(['cataract', 'pterygium', 'pinguecula', 'glaucoma', 'normal', 'other']);
export const datasetListQuery = listQuery.extend({
  review_status: z.enum(['pending', 'approved', 'rejected']).optional(),
  disease_class: datasetClass.optional(),
  dataset_status: z.enum(['local', 'uploaded_to_roboflow', 'upload_failed']).optional(),
});
export const datasetCreateSchema = z.object({ suggested_class: datasetClass.optional().nullable().or(z.literal('').transform(() => null)) });
export const datasetUpdateSchema = z.object({ disease_class: datasetClass });
export const datasetApproveSchema = z.object({ disease_class: datasetClass });
export const datasetRejectSchema = z.object({ reason: z.string().trim().min(3, 'กรุณาระบุเหตุผล').max(500) });

export const roboflowImagesQuery = z.object({
  offset: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  class_name: z.string().max(100).optional(),
  tag: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
});
export const roboflowGenerateSchema = z.object({
  resize: z.number().int().min(64).max(2048).optional().default(640),
});
export const roboflowTrainSchema = z.object({
  version: z.number().int().min(1),
  speed: z.enum(['fast', 'accurate']).optional(),
});
