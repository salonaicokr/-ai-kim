-- Patch applied to the cloud project after 20261106120000: member_offs.kind uses off/duty.
alter table member_offs drop constraint if exists member_offs_kind_check;
alter table member_offs add constraint member_offs_kind_check check (kind in ('off', 'duty'));
