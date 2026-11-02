-- Generated from config/platform-settings.json 2026-11-02
-- Arbitrary platform defaults. PG and Naver API stay off.
-- Supabase already provides anon and authenticated, and wraps this file in a transaction.

create table service_categories (
  id text primary key,
  name text not null,
  sort_order integer not null
);

create table menu_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  name text not null,
  price_krw integer not null check (price_krw >= 0),
  duration_min integer not null check (duration_min > 0),
  revisit_cycle_days integer check (revisit_cycle_days is null or revisit_cycle_days > 0),
  sort_order integer not null
);

create table record_field_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('photo', 'text', 'long_text')),
  required boolean not null,
  shareable boolean not null,
  default_shared boolean not null,
  ai_input boolean not null,
  sort_order integer not null,
  unique (category_id, field_key)
);

create table pre_question_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  prompt text not null,
  sensitive boolean not null,
  required boolean not null,
  ai_input boolean not null,
  sort_order integer not null
);

create table message_templates (
  code text primary key,
  channel text not null check (channel in ('alimtalk', 'push')),
  audience text not null check (audience in ('customer', 'staff')),
  name text not null,
  counts_toward_cap boolean not null,
  variables jsonb not null,
  body text not null,
  buttons jsonb not null
);

create table notification_rules (
  id text primary key,
  menu_template_id text not null references menu_templates (id),
  schedule_type text not null check (schedule_type in ('offset_days', 'before_cycle')),
  days integer not null check (days >= 0),
  send_local_time time not null,
  template_code text not null references message_templates (code),
  priority integer not null,
  unique (menu_template_id, schedule_type, days, template_code)
);

create table consent_documents (
  code text primary key,
  title text not null,
  required boolean not null,
  prechecked boolean not null,
  timing text not null check (timing in ('signup', 'store_connect', 'pre_question')),
  version text not null,
  body text not null
);

create table role_permissions (
  role text not null check (role in ('customer', 'assistant', 'staff', 'owner', 'operator')),
  resource text not null,
  action text not null,
  scope text not null check (scope in ('self', 'assigned', 'store', 'platform', 'platform_audited')),
  primary key (role, resource, action)
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  version text not null,
  updated_at timestamptz not null default now()
);

insert into service_categories (id, name, sort_order) values ($txt$hair$txt$, $txt$헤어$txt$, 1);
insert into service_categories (id, name, sort_order) values ($txt$nail$txt$, $txt$네일$txt$, 2);

insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$RSV_CONFIRMED$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$예약 확정$txt$, false, $txt$["매장명","고객명","일시","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 예약이 확정되었습니다.
#{고객명}님, #{일시} #{시술명} 예약이 확정되었습니다.
변경이나 취소는 방문 24시간 전까지 아래에서 할 수 있습니다.$txt$, $txt$[{"name":"예약 확인","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$RSV_REJECTED$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$예약 거절$txt$, false, $txt$["매장명","고객명","일시","시술명","사유","링크"]$txt$::jsonb, $txt$[#{매장명}] 예약 요청을 진행하기 어렵습니다.
#{고객명}님, #{일시} #{시술명} 요청은 확정되지 않았습니다.
#{사유}$txt$, $txt$[{"name":"다른 시간 보기","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$RSV_ALT_TIME$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$시간 제안$txt$, false, $txt$["매장명","고객명","일시","제안일시","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 다른 시간을 제안드립니다.
#{고객명}님, 요청하신 #{일시} 대신 #{제안일시}에 #{시술명}이 가능합니다.$txt$, $txt$[{"name":"제안 확인","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$RSV_REMIND_D1$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$방문 하루 전$txt$, false, $txt$["매장명","고객명","일시","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 내일 예약이 있습니다.
#{고객명}님, #{일시} #{시술명} 예약이 있습니다.$txt$, $txt$[{"name":"예약 확인","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$PRE_QUESTION$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$사전 질문$txt$, false, $txt$["매장명","고객명","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 시술 전 확인이 있습니다.
#{고객명}님, #{시술명} 전에 질문 몇 가지에 답해 주세요. 앱이 없어도 링크에서 응답할 수 있습니다.$txt$, $txt$[{"name":"질문 답하기","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$RECORD_SHARED$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$기록 공유$txt$, false, $txt$["매장명","고객명","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 시술 기록이 추가되었습니다.
#{고객명}님, #{시술명} 기록을 내 기록에서 볼 수 있습니다.$txt$, $txt$[{"name":"기록 보기","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$CARE_TIP$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$시술 후 케어$txt$, true, $txt$["매장명","고객명","시술명","경과일","내용","링크"]$txt$::jsonb, $txt$[#{매장명}] 시술 후 안내입니다.
#{고객명}님, #{시술명} #{경과일}일차 안내입니다.
#{내용}$txt$, $txt$[{"name":"안내 보기","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$REVISIT_D3$txt$, $txt$alimtalk$txt$, $txt$customer$txt$, $txt$재방문 3일 전$txt$, true, $txt$["매장명","고객명","시술명","링크"]$txt$::jsonb, $txt$[#{매장명}] 다음 방문일이 다가왔습니다.
#{고객명}님, #{시술명} 권장 방문일이 3일 남았습니다.$txt$, $txt$[{"name":"예약하기","type":"WL","url":"#{링크}"}]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$STAFF_NEW_REQUEST$txt$, $txt$push$txt$, $txt$staff$txt$, $txt$예약 요청$txt$, false, $txt$["고객명","시술명","일시","응답기한"]$txt$::jsonb, $txt$#{고객명}님 #{시술명} 예약 요청이 있습니다. #{일시}. #{응답기한}까지 확정, 거절, 시간 제안 중 하나를 선택해 주세요.$txt$, $txt$[]$txt$::jsonb);
insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values ($txt$STAFF_DRAFT_REMINDER$txt$, $txt$push$txt$, $txt$staff$txt$, $txt$보관함 리마인더$txt$, false, $txt$["고객명","시술명"]$txt$::jsonb, $txt$#{고객명}님 #{시술명} 기록이 사진 없이 보관함에 있습니다.$txt$, $txt$[]$txt$::jsonb);

insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_before_photo$txt$, $txt$hair$txt$, $txt$before_photo$txt$, $txt$시술 전 사진$txt$, $txt$photo$txt$, false, true, true, false, 1);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_after_photo$txt$, $txt$hair$txt$, $txt$after_photo$txt$, $txt$시술 후 사진$txt$, $txt$photo$txt$, false, true, true, false, 2);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_formula$txt$, $txt$hair$txt$, $txt$formula$txt$, $txt$사용 제품·약제$txt$, $txt$text$txt$, false, true, false, true, 3);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_color$txt$, $txt$hair$txt$, $txt$color$txt$, $txt$컬러$txt$, $txt$text$txt$, false, true, false, true, 4);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_public_note$txt$, $txt$hair$txt$, $txt$public_note$txt$, $txt$고객 안내$txt$, $txt$long_text$txt$, false, true, true, true, 5);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$hair_private_note$txt$, $txt$hair$txt$, $txt$private_note$txt$, $txt$내부 메모$txt$, $txt$long_text$txt$, false, false, false, false, 6);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$hair_chemical$txt$, $txt$hair$txt$, $txt$최근 염색, 펌, 탈색을 한 시기와 종류를 적어 주세요.$txt$, true, false, true, 1);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$hair_allergy$txt$, $txt$hair$txt$, $txt$두피 트러블이나 염색약 알레르기가 있으면 적어 주세요.$txt$, true, false, true, 2);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$hair_wish$txt$, $txt$hair$txt$, $txt$이번에 원하는 방향을 적어 주세요.$txt$, false, false, true, 3);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_cut_w$txt$, $txt$hair$txt$, $txt$여성 커트$txt$, 30000, 40, 42, 1);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_cut_w_REVISIT_D3_before_cycle_3$txt$, $txt$hair_cut_w$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_cut_m$txt$, $txt$hair$txt$, $txt$남성 커트$txt$, 20000, 30, 28, 2);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_cut_m_REVISIT_D3_before_cycle_3$txt$, $txt$hair_cut_m$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_bang$txt$, $txt$hair$txt$, $txt$앞머리 커트$txt$, 10000, 15, null, 3);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_dry$txt$, $txt$hair$txt$, $txt$드라이$txt$, 25000, 30, null, 4);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_root$txt$, $txt$hair$txt$, $txt$뿌리염색$txt$, 70000, 90, 42, 5);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_root_CARE_TIP_offset_days_1$txt$, $txt$hair_root$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_root_CARE_TIP_offset_days_7$txt$, $txt$hair_root$txt$, $txt$offset_days$txt$, 7, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_root_REVISIT_D3_before_cycle_3$txt$, $txt$hair_root$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_color$txt$, $txt$hair$txt$, $txt$염색$txt$, 90000, 120, 49, 6);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_color_CARE_TIP_offset_days_1$txt$, $txt$hair_color$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_color_CARE_TIP_offset_days_7$txt$, $txt$hair_color$txt$, $txt$offset_days$txt$, 7, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_color_CARE_TIP_offset_days_14$txt$, $txt$hair_color$txt$, $txt$offset_days$txt$, 14, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_color_REVISIT_D3_before_cycle_3$txt$, $txt$hair_color$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_bleach$txt$, $txt$hair$txt$, $txt$탈색$txt$, 150000, 180, 56, 7);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_bleach_CARE_TIP_offset_days_1$txt$, $txt$hair_bleach$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_bleach_CARE_TIP_offset_days_7$txt$, $txt$hair_bleach$txt$, $txt$offset_days$txt$, 7, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_bleach_CARE_TIP_offset_days_14$txt$, $txt$hair_bleach$txt$, $txt$offset_days$txt$, 14, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_bleach_REVISIT_D3_before_cycle_3$txt$, $txt$hair_bleach$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_perm$txt$, $txt$hair$txt$, $txt$펌$txt$, 130000, 150, 56, 8);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_perm_CARE_TIP_offset_days_1$txt$, $txt$hair_perm$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_perm_CARE_TIP_offset_days_7$txt$, $txt$hair_perm$txt$, $txt$offset_days$txt$, 7, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_perm_CARE_TIP_offset_days_14$txt$, $txt$hair_perm$txt$, $txt$offset_days$txt$, 14, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_perm_REVISIT_D3_before_cycle_3$txt$, $txt$hair_perm$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$hair_clinic$txt$, $txt$hair$txt$, $txt$클리닉$txt$, 80000, 60, 28, 9);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_clinic_CARE_TIP_offset_days_1$txt$, $txt$hair_clinic$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_clinic_CARE_TIP_offset_days_7$txt$, $txt$hair_clinic$txt$, $txt$offset_days$txt$, 7, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$hair_clinic_REVISIT_D3_before_cycle_3$txt$, $txt$hair_clinic$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_before_photo$txt$, $txt$nail$txt$, $txt$before_photo$txt$, $txt$시술 전 사진$txt$, $txt$photo$txt$, false, true, true, false, 1);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_after_photo$txt$, $txt$nail$txt$, $txt$after_photo$txt$, $txt$시술 후 사진$txt$, $txt$photo$txt$, false, true, true, false, 2);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_design$txt$, $txt$nail$txt$, $txt$design$txt$, $txt$디자인·파츠$txt$, $txt$text$txt$, false, true, true, true, 3);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_color$txt$, $txt$nail$txt$, $txt$color$txt$, $txt$컬러$txt$, $txt$text$txt$, false, true, true, true, 4);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_public_note$txt$, $txt$nail$txt$, $txt$public_note$txt$, $txt$고객 안내$txt$, $txt$long_text$txt$, false, true, true, true, 5);
insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values ($txt$nail_private_note$txt$, $txt$nail$txt$, $txt$private_note$txt$, $txt$내부 메모$txt$, $txt$long_text$txt$, false, false, false, false, 6);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$nail_allergy$txt$, $txt$nail$txt$, $txt$젤이나 아세톤 알레르기가 있으면 적어 주세요.$txt$, true, false, true, 1);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$nail_condition$txt$, $txt$nail$txt$, $txt$깨짐, 들뜸처럼 지금 네일 상태를 적어 주세요.$txt$, true, false, true, 2);
insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values ($txt$nail_wish$txt$, $txt$nail$txt$, $txt$원하는 디자인이나 유지 기간을 적어 주세요.$txt$, false, false, true, 3);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$nail_gel$txt$, $txt$nail$txt$, $txt$젤 원컬러$txt$, 50000, 60, 21, 1);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_gel_CARE_TIP_offset_days_1$txt$, $txt$nail_gel$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_gel_REVISIT_D3_before_cycle_3$txt$, $txt$nail_gel$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$nail_art$txt$, $txt$nail$txt$, $txt$젤 아트$txt$, 70000, 90, 21, 2);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_art_CARE_TIP_offset_days_1$txt$, $txt$nail_art$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_art_REVISIT_D3_before_cycle_3$txt$, $txt$nail_art$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$nail_pedi$txt$, $txt$nail$txt$, $txt$페디 젤$txt$, 65000, 70, 28, 3);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_pedi_CARE_TIP_offset_days_1$txt$, $txt$nail_pedi$txt$, $txt$offset_days$txt$, 1, '10:00', $txt$CARE_TIP$txt$, 20);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_pedi_REVISIT_D3_before_cycle_3$txt$, $txt$nail_pedi$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$nail_care$txt$, $txt$nail$txt$, $txt$네일 케어$txt$, 30000, 40, 21, 4);
insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values ($txt$nail_care_REVISIT_D3_before_cycle_3$txt$, $txt$nail_care$txt$, $txt$before_cycle$txt$, 3, '10:00', $txt$REVISIT_D3$txt$, 10);
insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values ($txt$nail_remove$txt$, $txt$nail$txt$, $txt$젤 제거$txt$, 15000, 20, null, 5);

insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$terms$txt$, $txt$서비스 이용약관$txt$, true, false, $txt$signup$txt$, $txt$2026-11-02$txt$, $txt$SALONAI는 매장 예약, 시술 기록, 고객 알림을 제공합니다.
만 14세 미만은 가입할 수 없습니다.
예약의 확정, 변경, 취소는 매장 설정과 이 약관의 시간 규칙을 따릅니다. 고객은 방문 24시간 전까지 예약을 취소할 수 있습니다. 그 이후의 취소와 노쇼는 매장이 상태로 기록하며, 1차에서는 위약금을 청구하지 않습니다.
결제 대행은 제공하지 않습니다. 매출에 남는 금액, 시술명, 환불 여부는 매장이 직접 입력합니다.
시술 기록은 담당자가 작성하고, 담당자가 확인한 뒤에만 고객에게 공유됩니다. 글만으로도 공유할 수 있습니다.
고객은 매장별로 기록 공개 범위를 바꿀 수 있고, 철회는 바로 반영됩니다. 매장 내부 메모는 고객과 다른 매장에 보이지 않습니다.
탈퇴는 진행 중인 예약이 없을 때 접수됩니다. 30일이 지나면 파기하고, 법령상 보관이 필요한 기록은 분리 보관합니다.$txt$);
insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$privacy$txt$, $txt$개인정보 처리$txt$, true, false, $txt$signup$txt$, $txt$2026-11-02$txt$, $txt$수집 항목은 계정 식별자, 이름, 휴대폰 번호, 소셜 로그인 식별자, 본인인증 결과(CI), 예약과 방문 정보, 시술 기록, 사진, 사전 질문 답변, 알림 수신 기록, 매장이 입력한 금액·시술명·환불 여부입니다. 카드번호는 보관하지 않습니다.
목적은 회원 식별, 예약 수행, 기록 보관과 공유, 알림 발송, 매출 집계, 분쟁 처리입니다.
사진에 포함된 위치정보(EXIF)는 업로드할 때 제거합니다. 파일은 비공개로 저장하고, 시간이 지나면 만료되는 링크로만 보여 줍니다.
고객이 연결한 매장에만 예약과, 고객이 연 범위의 기록을 제공합니다. 다른 매장에는 제공하지 않습니다.
알림 발송 대행사, 클라우드 운영, 본인인증, 기록 요약 AI에 처리를 맡길 수 있습니다. 내부 메모, 이름, 연락처, 사진은 AI 입력에서 뺍니다.
탈퇴 후 30일이 지나면 파기합니다. 법령상 보관 의무가 있는 항목은 그 기간 동안 분리 보관합니다.
이용자는 자신의 정보를 열람, 정정, 내려받기, 삭제, 처리정지할 수 있습니다.$txt$);
insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$service_notice$txt$, $txt$예약·기록 알림$txt$, true, false, $txt$signup$txt$, $txt$2026-11-02$txt$, $txt$예약 접수, 확정, 거절, 시간 제안, 방문 하루 전 안내, 사전 질문, 기록 공유처럼 예약과 기록을 제공하는 데 필요한 알림을 보냅니다.
앱이 있으면 푸시가 먼저 가고, 없으면 카카오 알림톡, 그것도 실패하면 문자로 보냅니다. 발신 채널은 매장별 채널이 아니라 SALONAI 공통 채널 하나입니다. 본문에 매장명이 들어갑니다.
21시부터 다음 날 8시까지는 보내지 않고, 8시 30분으로 미룹니다.$txt$);
insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$care_revisit$txt$, $txt$케어·재방문 알림$txt$, false, false, $txt$store_connect$txt$, $txt$2026-11-02$txt$, $txt$시술 종류에 맞춘 홈케어 안내와 재방문 안내를 보냅니다. 동의하지 않아도 예약과 기록 이용은 가능합니다.
같은 매장에서 케어와 재방문 안내를 합쳐 하루 2건, 7일에 5건을 넘기지 않습니다. 예약 확정처럼 예약 진행에 필요한 알림은 이 횟수에 넣지 않습니다.
매장 연결 화면에서 언제든 철회할 수 있습니다.$txt$);
insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$marketing$txt$, $txt$마케팅 수신$txt$, false, false, $txt$store_connect$txt$, $txt$2026-11-02$txt$, $txt$이벤트와 프로모션 안내를 받을 수 있습니다. 동의하지 않아도 예약, 기록, 케어 안내 설정은 그대로입니다. 언제든 철회할 수 있습니다.$txt$);
insert into consent_documents (code, title, required, prechecked, timing, version, body) values ($txt$sensitive$txt$, $txt$사전 질문 민감정보$txt$, true, false, $txt$pre_question$txt$, $txt$2026-11-02$txt$, $txt$알레르기, 두피나 네일 상태, 최근 화학 시술 이력처럼 건강에 가까운 답변은 그 매장의 시술 안전과 상담에만 씁니다.
해당 매장의 담당자와 점주만 봅니다. 다른 매장과 보조 인력에게는 보이지 않습니다.
동의한 답변은 주의 항목을 요약하는 데 쓰일 수 있습니다. 이름, 연락처, 사진은 요약 입력에 넣지 않습니다.
민감 질문에 답하지 않아도 예약을 진행할 수 있습니다. 이미 보낸 답변은 삭제할 수 있습니다.$txt$);

insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$profile$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$profile$txt$, $txt$write$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$consent$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$consent$txt$, $txt$write$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$visit$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$visit$txt$, $txt$cancel$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$record_shared$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$self_note$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$self_note$txt$, $txt$write$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$share_setting$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$share_setting$txt$, $txt$write$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$pre_answer$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$pre_answer$txt$, $txt$write$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$payment_record$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$customer$txt$, $txt$notification$txt$, $txt$read$txt$, $txt$self$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$assistant$txt$, $txt$visit$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$assistant$txt$, $txt$visit$txt$, $txt$check_in$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$assistant$txt$, $txt$photo$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$assistant$txt$, $txt$record_draft$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$assistant$txt$, $txt$customer_brief$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$visit$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$visit$txt$, $txt$write$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$record$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$record$txt$, $txt$write$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$record$txt$, $txt$approve_share$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$private_memo$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$private_memo$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$photo$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$photo$txt$, $txt$write$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$pre_answer$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$payment_record$txt$, $txt$read$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$payment_record$txt$, $txt$write$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$customer$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$staff$txt$, $txt$notification$txt$, $txt$read$txt$, $txt$assigned$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$visit$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$visit$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$visit$txt$, $txt$correct_status$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$record$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$record$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$record$txt$, $txt$approve_share$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$private_memo$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$private_memo$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$photo$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$photo$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$pre_answer$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$payment_record$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$payment_record$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$customer$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$customer$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$menu$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$menu$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$store_settings$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$store_settings$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$staff_membership$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$staff_membership$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$notification_rule$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$notification_rule$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$external_block$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$external_block$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$import_job$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$import_job$txt$, $txt$write$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$owner$txt$, $txt$sales_report$txt$, $txt$read$txt$, $txt$store$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$store_application$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$store_application$txt$, $txt$write$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$account$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$account$txt$, $txt$suspend$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$menu_template$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$menu_template$txt$, $txt$write$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$message_template$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$message_template$txt$, $txt$write$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$consent_document$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$consent_document$txt$, $txt$write$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$notification_rule_template$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$notification_rule_template$txt$, $txt$write$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$audit$txt$, $txt$read$txt$, $txt$platform$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$record$txt$, $txt$read$txt$, $txt$platform_audited$txt$);
insert into role_permissions (role, resource, action, scope) values ($txt$operator$txt$, $txt$monitoring$txt$, $txt$read$txt$, $txt$platform$txt$);

insert into app_settings (key, value, version) values ($txt$flags$txt$, $txt${"pgEnabled":false,"naverApiEnabled":false,"externalBookingMode":"manual_block","paymentRecordMode":"manual","kakaoChannelMode":"single_shared","copyTemplatesOnStoreCreate":true}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$clients$txt$, $txt${"staff":"native_app","assistant":"native_app","customer":"native_app","owner":"web","operator":"web"}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$operations$txt$, $txt${"slotIntervalMinutes":30,"slotHoldMinutes":5,"requestResponseMinutes":120,"requestTimeoutAction":"expire","autoConfirmRequest":false,"customerCancelFreeUntilHours":24,"lateCancelAllowed":true,"lateCancelFeeKrw":0,"noShowAction":"mark_only","minAge":14,"sendLocalTime":"10:00","quietHours":{"start":"21:00","end":"08:00","releaseAt":"08:30"},"notificationCaps":{"maxPerDay":2,"maxPer7Days":5,"cappedTemplateCodes":["CARE_TIP","REVISIT_D3"]},"notificationChannelOrder":["push","alimtalk","sms"],"record":{"photoSkipCreatesDraft":true,"allowTextOnlyShare":true,"staffApprovalBeforeShare":true,"draftReminderHoursAfterComplete":[3,20],"stripExif":true,"signedUrl":true}}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$default_hours$txt$, $txt${"mon":["10:00","20:00"],"tue":["10:00","20:00"],"wed":["10:00","20:00"],"thu":["10:00","20:00"],"fri":["10:00","20:00"],"sat":["10:00","20:00"],"sun":["10:00","20:00"]}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$retention$txt$, $txt${"deleteAfterWithdrawGraceDays":30,"legalHoldSeparated":true}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$ai$txt$, $txt${"requiresStaffApproval":true,"excludePrivateMemo":true,"excludeIdentifiers":true,"photosAsInput":false}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$onboarding_checklist$txt$, $txt$[{"id":"hours","label":"영업시간"},{"id":"menus","label":"메뉴·소요시간"},{"id":"staff","label":"담당자 초대"},{"id":"notices","label":"알림 문구 확인"},{"id":"import","label":"기존 고객 파일"}]$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$payment_record$txt$, $txt${"manyPerVisit":true,"fields":["amount_krw","service_name","entry_type","method_label","note"],"entryTypes":[{"id":"paid","label":"수납"},{"id":"refund","label":"환불"},{"id":"partial_refund","label":"부분 환불"}],"methodLabels":[{"id":"cash","label":"현금"},{"id":"card_terminal","label":"카드 단말기"},{"id":"naver_pay","label":"네이버페이(매장 수기)"},{"id":"transfer","label":"계좌이체"},{"id":"other","label":"기타"}]}$txt$::jsonb, $txt$2026-11-02$txt$);
insert into app_settings (key, value, version) values ($txt$external_block$txt$, $txt${"maxSteps":3,"steps":["날짜와 시작·종료 시간","출처와 담당자","반복 여부와 저장"],"sources":[{"id":"naver","label":"네이버"},{"id":"phone","label":"전화"},{"id":"other","label":"기타"}],"repeat":[{"id":"none","label":"반복 없음"},{"id":"weekly","label":"매주"}]}$txt$::jsonb, $txt$2026-11-02$txt$);

alter table consent_documents enable row level security;
create policy consent_documents_read on consent_documents for select to anon, authenticated using (true);
alter table service_categories enable row level security;
create policy service_categories_read on service_categories for select to authenticated using (true);
alter table menu_templates enable row level security;
create policy menu_templates_read on menu_templates for select to authenticated using (true);
alter table record_field_templates enable row level security;
create policy record_field_templates_read on record_field_templates for select to authenticated using (true);
alter table pre_question_templates enable row level security;
create policy pre_question_templates_read on pre_question_templates for select to authenticated using (true);
alter table message_templates enable row level security;
create policy message_templates_read on message_templates for select to authenticated using (true);
alter table notification_rules enable row level security;
create policy notification_rules_read on notification_rules for select to authenticated using (true);
alter table role_permissions enable row level security;
create policy role_permissions_read on role_permissions for select to authenticated using (true);
alter table app_settings enable row level security;
create policy app_settings_read on app_settings for select to authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on consent_documents to anon, authenticated;
grant select on service_categories, menu_templates, record_field_templates, pre_question_templates, message_templates, notification_rules, role_permissions, app_settings to authenticated;

