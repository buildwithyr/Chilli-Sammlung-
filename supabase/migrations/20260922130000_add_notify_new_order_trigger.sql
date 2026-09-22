-- Löst bei jeder neuen Bestellanfrage die Edge Function notify-new-order
-- aus (Web-Push an registrierte Geräte). Bereits auf der Live-Datenbank
-- ausgeführt am 22.09.2026.
--
-- WICHTIG: Das eigentliche Geheimnis, mit dem die Datenbank sich bei der
-- Function ausweist, steht bewusst NICHT hier (öffentliches Repo!),
-- sondern in Supabase Vault. Es wurde einmalig per SQL angelegt:
--   select vault.create_secret('<zufälliger Wert>', 'notify_new_order_webhook_secret');
-- Der gleiche Wert muss als Edge-Function-Secret INTERNAL_WEBHOOK_SECRET
-- hinterlegt sein (Dashboard -> Edge Functions -> Secrets).

create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_notify_new_order()
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
    url := 'https://anzcmncgkfvncpuatxzh.supabase.co/functions/v1/notify-new-order',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists notify_new_order_trigger on public.bestellanfragen;
create trigger notify_new_order_trigger
after insert on public.bestellanfragen
for each row execute function public.trigger_notify_new_order();
