-- Create api_keys table for permanent tokens
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_value TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Users can view their own api keys'
    ) THEN
        CREATE POLICY "Users can view their own api keys" 
            ON public.api_keys 
            FOR SELECT 
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Users can insert their own api keys'
    ) THEN
        CREATE POLICY "Users can insert their own api keys" 
            ON public.api_keys 
            FOR INSERT 
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Users can delete their own api keys'
    ) THEN
        CREATE POLICY "Users can delete their own api keys" 
            ON public.api_keys 
            FOR DELETE 
            USING (auth.uid() = user_id);
    END IF;
END $$;
