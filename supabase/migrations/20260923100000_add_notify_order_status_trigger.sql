-- Löst bei jeder Statusänderung einer Bestellanfrage (angefragt →
-- bestaetigt oder storniert) die Edge Function notify-order-status aus,
-- die den Kunden per E-Mail benachrichtigt (sofern er eine E-Mail-Adresse
-- im Kontaktfeld angegeben hat).
--
-- Nutzt dasselbe Geheimnis wie notify-new-order (Vault-Eintrag
-- 'notify_new_order_webhook_secret', Edge-Function-Secret
-- INTERNAL_WEBHOOK_SECRET). Kein zusätzlicher Vault-Eintrag nötig.

create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_new_order_webhook_secret';

  perform net.http_post(
    url := 'https://anzcmncgkfvncpuatxzh.supabase.co/functions/v1/notify-order-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists notify_order_status_trigger on public.bestellanfragen;
create trigger notify_order_status_trigger
after update on public.bestellanfragen
for each row
when (old.status is distinct from new.status and new.status in ('bestaetigt', 'storniert'))
execute function public.trigger_notify_order_status();
