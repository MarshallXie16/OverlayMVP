/**
 * Tests for form validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateName,
} from './validation';

describe('validateEmail', () => {
  it('should accept valid email addresses', () => {
    expect(validateEmail('user@example.com').isValid).toBe(true);
    expect(validateEmail('test.user@domain.co.uk').isValid).toBe(true);
    expect(validateEmail('user+tag@example.com').isValid).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(validateEmail('notanemail').isValid).toBe(false);
    expect(validateEmail('missing@domain').isValid).toBe(false);
    expect(validateEmail('@nodomain.com').isValid).toBe(false);
    expect(validateEmail('user@').isValid).toBe(false);
  });

  it('should reject empty email', () => {
    const result = validateEmail('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email is required');
  });

  it('should provide error messages', () => {
    const result = validateEmail('invalid');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid email format');
  });
});

describe('validatePassword', () => {
  it('should accept valid passwords', () => {
    expect(validatePassword('password123').isValid).toBe(true);
    expect(validatePassword('MySecure1Password').isValid).toBe(true);
    expect(validatePassword('12345678a').isValid).toBe(true);
  });

  it('should reject passwords shorter than 8 characters', () => {
    const result = validatePassword('pass1');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Password must be at least 8 characters');
  });

  it('should reject passwords without letters', () => {
    const result = validatePassword('12345678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(
      'Password must contain at least one letter and one number'
    );
  });

  it('should reject passwords without numbers', () => {
    const result = validatePassword('password');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(
      'Password must contain at least one letter and one number'
    );
  });

  it('should reject empty password', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Password is required');
  });
});

describe('validatePasswordConfirmation', () => {
  it('should accept matching passwords', () => {
    const result = validatePasswordConfirmation('password123', 'password123');
    expect(result.isValid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('should reject non-matching passwords', () => {
    const result = validatePasswordConfirmation('password123', 'different123');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Passwords do not match');
  });
});

describe('validateName', () => {
  it('should accept valid names', () => {
    expect(validateName('John Doe').isValid).toBe(true);
    expect(validateName('Alice').isValid).toBe(true);
    expect(validateName('Dr. Smith').isValid).toBe(true);
  });

  it('should reject empty name', () => {
    const result = validateName('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('should reject whitespace-only name', () => {
    const result = validateName('   ');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('should reject names shorter than 2 characters', () => {
    const result = validateName('A');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Name must be at least 2 characters');
  });
});
