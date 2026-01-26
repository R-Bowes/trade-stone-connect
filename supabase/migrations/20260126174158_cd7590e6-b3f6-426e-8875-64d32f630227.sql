-- Create conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Participants
  initiator_id UUID NOT NULL, -- User who started the conversation
  recipient_id UUID NOT NULL, -- Contractor receiving the message
  
  -- Context (optional references)
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  issued_quote_id UUID REFERENCES public.issued_quotes(id) ON DELETE SET NULL,
  
  -- Conversation details
  subject TEXT NOT NULL,
  initiator_type TEXT NOT NULL, -- 'personal', 'business', or 'contractor'
  
  -- Status
  is_archived_initiator BOOLEAN NOT NULL DEFAULT false,
  is_archived_recipient BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate conversations between same users for same context
  CONSTRAINT unique_conversation UNIQUE (initiator_id, recipient_id, contract_id, quote_id, issued_quote_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  
  -- Read status
  read_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS: Users can only see conversations they're part of
CREATE POLICY "Users can view their own conversations"
ON public.conversations FOR SELECT
USING (initiator_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (initiator_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
ON public.conversations FOR UPDATE
USING (initiator_id = auth.uid() OR recipient_id = auth.uid());

-- Messages RLS: Users can only see messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND (c.initiator_id = auth.uid() OR c.recipient_id = auth.uid())
  )
);

CREATE POLICY "Users can send messages in their conversations"
ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND (c.initiator_id = auth.uid() OR c.recipient_id = auth.uid())
  )
);

CREATE POLICY "Users can update their own messages"
ON public.messages FOR UPDATE
USING (sender_id = auth.uid());

-- Function to update conversation's last_message_at when new message is added
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Trigger for updating last_message_at
CREATE TRIGGER update_conversation_on_new_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_last_message();

-- Trigger for updated_at on conversations
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_conversations_initiator ON public.conversations(initiator_id);
CREATE INDEX idx_conversations_recipient ON public.conversations(recipient_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_messages_unread ON public.messages(conversation_id, read_at) WHERE read_at IS NULL;