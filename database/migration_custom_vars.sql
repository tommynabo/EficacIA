-- Migration: add custom variables column to leads table
-- Run this in your Supabase SQL editor
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS custom_vars JSONB DEFAULT '{}';
