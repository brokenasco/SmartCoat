-- Enum values must commit before later migrations can use them.
alter type public.estimate_status add value if not exists 'approved';
alter type public.estimate_status add value if not exists 'archived';
alter type public.estimate_status add value if not exists 'canceled';
