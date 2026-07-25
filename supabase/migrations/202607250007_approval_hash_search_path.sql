-- Qualify the approval transaction's pgcrypto dependency while retaining fully-qualified application objects.
alter function public.approve_estimate(uuid) set search_path = extensions;
