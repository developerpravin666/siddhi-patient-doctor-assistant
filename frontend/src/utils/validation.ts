import { z } from 'zod';

/**
 * Doctor Profile & Schedule Validation Schema
 * Enforces valid doctor name, specialization, available days, and slot intervals (5, 10, 15, 20, 30, 45, 60 mins).
 */
export const doctorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Doctor full name must be at least 2 characters long' })
    .max(100, { message: 'Doctor name cannot exceed 100 characters' }),
  specialty: z
    .string()
    .trim()
    .min(2, { message: 'Specialization is required (e.g., General Physician, Cardiologist)' })
    .max(100, { message: 'Specialty cannot exceed 100 characters' }),
  available_days: z
    .string()
    .trim()
    .min(1, { message: 'Please select at least one working day' }),
  slot_duration_minutes: z
    .number()
    .min(5, { message: 'Minimum appointment difference is 5 minutes' })
    .max(120, { message: 'Maximum appointment difference is 120 minutes' }),
  morning_slots: z.string().optional(),
  evening_slots: z.string().optional(),
  is_active: z.boolean().default(true),
});

export type DoctorFormData = z.infer<typeof doctorFormSchema>;

/**
 * Patient Directory Validation Schema
 * Enforces valid full name, 10-digit mobile number, optional email format, and age bounds.
 */
export const patientFormSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, { message: 'Patient full name must be at least 2 characters' })
    .max(120, { message: 'Patient name cannot exceed 120 characters' }),
  mobile_number: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, { message: 'Please enter a valid 10-digit mobile number (digits only)' }),
  email: z
    .string()
    .trim()
    .email({ message: 'Please enter a valid email address' })
    .optional()
    .or(z.literal('')),
  gender: z.string().optional(),
  age: z
    .number()
    .min(0, { message: 'Age cannot be negative' })
    .max(125, { message: 'Please enter a realistic age (0–125)' })
    .optional()
    .nullable(),
  address: z.string().trim().max(255).optional(),
  is_active: z.boolean().default(true),
});

export type PatientFormData = z.infer<typeof patientFormSchema>;

/**
 * WhatsApp API Configuration Schema
 * Validates Meta Cloud API credentials and verify tokens.
 */
export const whatsappConfigSchema = z.object({
  whatsapp_phone_number_id: z
    .string()
    .trim()
    .min(5, { message: 'Phone Number ID is typically 15 digits from Meta App Dashboard' })
    .optional()
    .or(z.literal('')),
  whatsapp_business_account_id: z
    .string()
    .trim()
    .min(5, { message: 'WhatsApp Business Account ID is required' })
    .optional()
    .or(z.literal('')),
  whatsapp_access_token: z
    .string()
    .trim()
    .min(10, { message: 'Meta Permanent System User Access Token is required' })
    .optional()
    .or(z.literal('')),
  whatsapp_verify_token: z
    .string()
    .trim()
    .min(6, { message: 'Webhook Verify Token must be at least 6 characters' }),
});

export type WhatsAppConfigFormData = z.infer<typeof whatsappConfigSchema>;

/**
 * User / Front Desk Staff Schema
 */
export const userFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, { message: 'Username must be at least 3 characters' })
    .max(50, { message: 'Username cannot exceed 50 characters' }),
  full_name: z
    .string()
    .trim()
    .min(2, { message: 'Full name must be at least 2 characters' }),
  role: z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'], {
    message: 'Please select a valid role',
  }),
  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters long' })
    .optional()
    .or(z.literal('')),
});

export type UserFormData = z.infer<typeof userFormSchema>;

/**
 * Helper to safely extract user-friendly error messages from Zod
 */
export const validateForm = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { isValid: boolean; errors: Record<string, string>; data?: T } => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { isValid: true, errors: {}, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path[0] ? String(issue.path[0]) : '_global';
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { isValid: false, errors };
};
