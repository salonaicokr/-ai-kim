"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import type { Perm, Permissions } from "@/src/lib/session";
import { PERM_GROUPS, PERM_KEYS, PERM_LABEL, ROLES, nextPerm, roleLabel, type Role } from "@/src/lib/perms";
import "./members.css";

export type Member = {
  id: string; user_id: string | null; display_name: string; role: Role; title: string; permissions: Permissions;
  status: "invited" | "active" | "left"; is_designer: boolean; invite_code: string | null; invited_phone: string | null; sort_order: number;
};
export type Log = { id: number; action: string; target_id: string | null; before: Partial<Member> | null; after: Partial<Member> | null; created_at: string };

type Props = { shopId: string; shopName: string; myId: string; isOwner: boolean; canPerm?: boolean; canInvite: boolean; initialMembers: Member[]; logs: Log[] };

const TITLE_CHIPS = ["원장", "부원장", "실장", "디자이너", "인턴", "스태프", "데스크"];
const SELECT = "id, user_id, display_name, role, title, permissions, status, is_designer, invite_code, invited_phone, sort_order";

export default function MembersEditor({ shopId, shopName, myId, isOwner, canPerm = false, canInvite, initialMembers, logs }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // 서버에서 그릴 때는 주소를 모르니 빈 값, 브라우저에서 실제 주소
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const [members, setMembers] = useState(initialMembers);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inv, setInv] = useState({ name: "", phone: "", role: "designer" as Exclude<Role, "owner">, title: "디자이너" });
  const [via, setVia] = useState<"sms" | "push">("sms");
  const [sentVia, setSentVia] = useState<"sms" | "push" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [justInvited, setJustInvited] = useState<Member | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "구성원";

  function report(error: { message: string } | null, ok: string) {
    setMsg(error ? { kind: "err", text: `저장 실패: ${error.message}` } : { kind: "ok", text: ok });
  }

  async function patch(id: string, p: Partial<Member>, ok: string) {
    const prev = members;
    const { data, error } = await supabase.from("shop_members").update(p).eq("id", id).select(SELECT).single();
    if (error) { setMembers(prev); report(error, ok); return; }
    setMembers((ms) => ms.map((m) => (m.id === id ? (data as Member) : m)));
    report(null, ok);
    router.refresh();
  }

  function saveTitle(m: Member) {
    const t = titleDraft.trim();
    setEditTitle(null);
    if (!t || t === m.title) return;
    patch(m.id, { title: t.slice(0, 16) }, `${m.display_name} 직함을 ‘${t}’(으)로 바꿨어요`);
  }

  function cycle(m: Member, key: string, own: boolean) {
    const cur = (m.permissions[key] ?? "none") as Perm;
    const nextPerms = { ...m.permissions, [key]: nextPerm(cur, own) };
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, permissions: nextPerms, role: "custom" } : x)));
    patch(m.id, { permissions: nextPerms, role: "custom" }, `${m.display_name} · ${PERM_KEYS.find((k) => k.key === key)?.label} → ${PERM_LABEL[nextPerms[key]]}`);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inv.name.trim()) return;
    const { data, error } = await supabase
      .from("shop_members")
      .insert({ shop_id: shopId, display_name: inv.name.trim(), invited_phone: inv.phone.trim() || null, role: inv.role, title: inv.title.trim() || "디자이너", status: "invited", is_designer: inv.role !== "desk", sort_order: members.length + 1 })
      .select(SELECT).single();
    report(error, via === "sms" ? `${inv.name} 님 초대 문자를 보낼 수 있게 문자 앱을 열었어요.` : `${inv.name} 님 초대 링크를 만들었어요. 앱 푸시는 정식 버전에서 연결돼요.`);
    if (data) {
      setMembers([...members, data as Member]);
      setJustInvited(data as Member);
      setSentVia(via);
      // 문자: 휴대폰 문자 앱을 번호 · 내용이 채워진 채로 바로 엶 (정식 버전에서는 서버가 자동 발송)
      if (via === "sms" && (data as Member).invited_phone) {
        const m = data as Member;
        const body = `[SALONAI] ${shopName}에서 ${m.display_name}님을 ${m.title}(으)로 초대했어요.\n아래 링크를 눌러 참여해주세요.\n${window.location.origin}/invite/${m.invite_code}`;
        window.location.href = `sms:${(m.invited_phone ?? "").replace(/[^0-9+]/g, "")}?&body=${encodeURIComponent(body)}`;
      }
      setInv({ name: "", phone: "", role: "designer", title: "디자이너" });
      setInviting(false);
    }
  }

  async function remove(m: Member) {
    if (m.status === "invited") {
      const { error } = await supabase.from("shop_members").delete().eq("id", m.id);
      report(error, `${m.display_name} 님 초대를 취소했어요`);
      if (!error) {
        setMembers(members.filter((x) => x.id !== m.id));
        if (justInvited?.id === m.id) setJustInvited(null);
      }
    } else {
      setConfirmLeave(null);
      await patch(m.id, { status: "left" }, `${m.display_name} 님을 퇴사 처리했어요. 지난 예약 · 결제 기록은 그대로 남아요.`);
      setMembers((ms) => ms.filter((x) => x.id !== m.id));
    }
  }

  const inviteUrl = (code: string) => `${origin}/invite/${code}`;
  const inviteText = (m: Member) =>
    `[SALONAI] ${shopName}에서 ${m.display_name}님을 ${m.title}(으)로 초대했어요.\n아래 링크를 눌러 참여해주세요.\n${inviteUrl(m.invite_code ?? "")}`;
  /** 휴대폰 문자 앱을 받는 사람 · 내용이 채워진 채로 열기 (iOS · Android 공통 형식) */
  const smsHref = (m: Member) => `sms:${(m.invited_phone ?? "").replace(/[^0-9+]/g, "")}?&body=${encodeURIComponent(inviteText(m))}`;

  async function copyLink(m: Member) {
    try { await navigator.clipboard.writeText(inviteText(m)); setCopied(m.invite_code); } catch { window.prompt("초대 문자 내용", inviteText(m)); }
  }

  const inviteActions = (m: Member, big = false) => (
      <div className={`inv-acts${big ? " big" : ""}`}>
        <a className={`btn pri${big ? "" : " sm-btn"}`} href={smsHref(m)}>
          {m.invited_phone ? `문자로 보내기 (${m.invited_phone})` : "문자로 보내기"}
        </a>
        <button type="button" className={`btn${big ? "" : " sm-btn"}`} onClick={() => copyLink(m)}>
          {copied === m.invite_code ? "복사됨" : "링크 복사"}
        </button>
        <button type="button" className={`btn ghost del${big ? "" : " sm-btn"}`} onClick={() => remove(m)}>초대 취소</button>
      </div>
  );

  // 원장 + 원장이 ‘권한 설정’을 준 구성원 (본인 권한은 원장만 바꿀 수 있음)
  const canEdit = isOwner || canPerm;

  return (
    <div className="mb-page">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div>
          <p className="crumb">설정 · 구성원 · 권한 · {shopName}</p>
          <h1 className="h1">권한은 원장님이 나눠 줍니다</h1>
        </div>
        <span className="sp" />
        {logs.length > 0 && <button className="btn ghost sm-btn" type="button" onClick={() => setShowLog((v) => !v)}>권한 변경 이력</button>}
        {canInvite && <button className="btn pri sm-btn" type="button" onClick={() => setInviting((v) => !v)}>+ 디자이너 초대</button>}
      </div>
      <p className="sm lead">
        <b>마스터 원장</b>은 매장의 모든 권한을 가지며, 구성원에게 기능별로 나눠 주고 언제든 회수할 수 있어요. 칸을 누를 때마다 <b>— → 본인 담당 → 전체</b> 순서로 바뀌고 바로 반영돼요.
      </p>
      {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      {inviting && (
        <form className="card inv" onSubmit={invite}>
          <h2 className="b">디자이너 초대</h2>
          <div className="inv-grid">
            <label className="field"><span className="lbl">이름</span>
              <input id="inv-name" className="input" required maxLength={20} placeholder="박지은" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></label>
            <label className="field"><span className="lbl">휴대폰 (초대 문자 받을 번호)</span>
              <input id="inv-phone" className="input" inputMode="tel" placeholder="010-0000-0000" value={inv.phone} onChange={(e) => setInv({ ...inv, phone: e.target.value })} /></label>
            <label className="field"><span className="lbl">직함</span>
              <input id="inv-title" className="input" maxLength={16} value={inv.title} onChange={(e) => setInv({ ...inv, title: e.target.value })} /></label>
            <label className="field"><span className="lbl">기본 권한</span>
              <select id="inv-role" className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Exclude<Role, "owner"> })}>
                {ROLES.filter((r) => r.value !== "custom").map((r) => <option key={r.value} value={r.value}>{r.label} · {r.hint}</option>)}
              </select></label>
          </div>
          <div className="field">
            <span className="lbl">보내는 방법</span>
            <div className="via">
              <button type="button" className={via === "sms" ? "on" : ""} onClick={() => setVia("sms")}>문자로 보내기</button>
              <button type="button" className={via === "push" ? "on" : ""} onClick={() => setVia("push")}>앱 푸시로 보내기 <span className="pill soon">정식 연결 필요</span></button>
            </div>
            <span className="sm">{via === "sms" ? "누르면 휴대폰 문자 앱이 번호 · 내용이 채워진 채로 열려요. 정식 버전에서는 버튼 한 번에 자동 발송돼요." : "SALONAI 앱을 설치한 디자이너에게 푸시 알림으로 보내요. 앱 출시 후 연결돼요. 지금은 링크 복사로 보내주세요."}</span>
          </div>
          <div className="row">
            <button className="btn pri" type="submit">초대 링크 보내기</button>
            <button className="btn ghost" type="button" onClick={() => setInviting(false)}>취소</button>
          </div>
        </form>
      )}

      {justInvited && justInvited.invite_code && (
        <div className="card inv-done" role="status">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h2 className="b">✓ {justInvited.display_name} 님 초대 링크를 {sentVia === "push" ? "만들었어요" : "보낼 준비가 됐어요"}</h2>
            <span className="sp" />
            <button type="button" className="btn ghost sm-btn" onClick={() => setJustInvited(null)}>닫기</button>
          </div>
          <pre className="inv-preview">{inviteText(justInvited)}</pre>
          <p className="msg ok">테스트 버전이라 {justInvited.display_name} 님이 링크를 수락하지 않아도 <b>예약 캘린더에 바로 보이고 예약을 받을 수 있어요.</b></p>
          {sentVia === "push" && <p className="msg note">앱 푸시 발송은 <b>정식 버전에서 연결</b>돼요. 지금은 아래 ‘문자로 보내기’나 ‘링크 복사’로 보내주세요.</p>}
          {inviteActions(justInvited, true)}
          <p className="sm">‘문자로 보내기’를 누르면 휴대폰 문자 앱이 번호와 내용이 채워진 채로 열려요. 전송만 누르면 돼요. (PC에서는 문자 앱이 없으면 ‘링크 복사’ 후 카톡 등으로 보내주세요)</p>
        </div>
      )}

      <div className="card mb-card">
        <div className="tw">
          <table className="pt2">
            <thead>
              <tr>
                <th className="corner" scope="col"><span className="sm">권한 ↓ · 구성원 →</span></th>
                {members.map((m, mi) => {
                  const owner = m.role === "owner";
                  return (
                    <th key={m.id} scope="col" className={`mcol${m.status === "invited" ? " invited" : ""}${mi % 2 ? " alt" : ""}`}>
                      <div className="mhead">
                        <div className="nm">{m.display_name}{m.id === myId && <span className="me">나</span>}</div>
                        {editTitle === m.id ? (
                          <div className="tedit">
                            <input id={`title-${m.id}`} className="input" autoFocus maxLength={16} value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(m); if (e.key === "Escape") setEditTitle(null); }} />
                            <div className="chips">
                              {TITLE_CHIPS.map((t) => <button key={t} type="button" className={`chip${titleDraft === t ? " on" : ""}`} onClick={() => setTitleDraft(t)}>{t}</button>)}
                            </div>
                            <div className="row" style={{ gap: 6 }}>
                              <button type="button" className="btn pri sm-btn" onClick={() => saveTitle(m)}>저장</button>
                              <button type="button" className="btn ghost sm-btn" onClick={() => setEditTitle(null)}>취소</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="title-btn" disabled={!canEdit}
                            onClick={() => { setEditTitle(m.id); setTitleDraft(m.title); }}
                            aria-label={`${m.display_name} 직함 ${m.title} 수정`}>
                            {m.title}{canEdit && <span aria-hidden> ✎</span>}
                          </button>
                        )}
                        <div className="role">
                          {owner || !canEdit ? (
                            <span className="sm">{roleLabel(m.role)}</span>
                          ) : (
                            <select aria-label={`${m.display_name} 기본 권한`} value={m.role}
                              onChange={(e) => patch(m.id, { role: e.target.value as Role, permissions: e.target.value === "custom" ? m.permissions : ({} as Permissions) }, `${m.display_name} 기본 권한을 ‘${roleLabel(e.target.value)}’(으)로 바꿨어요`)}>
                              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          )}
                          {m.status === "invited" && <span className="pill p-amb" title="테스트 버전: 수락 전에도 캘린더 · 예약에 바로 보여요">초대중 · 바로 사용</span>}
                        </div>
                        {m.status === "invited" && m.invite_code && canInvite && inviteActions(m)}
                        {!owner && canEdit && m.status !== "invited" && (confirmLeave === m.id ? (
                          <div className="leave-ask">
                            <span className="sm"><b>{m.display_name}</b> 님을 퇴사 처리할까요? 매장 화면에 더 이상 들어올 수 없고, 지난 기록은 남아요.</span>
                            <div className="row" style={{ gap: 6 }}>
                              <button type="button" className="btn ghost sm-btn" onClick={() => setConfirmLeave(null)}>취소</button>
                              <button type="button" className="btn sm-btn del-solid" onClick={() => remove(m)}>퇴사 처리</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="leave-link" onClick={() => setConfirmLeave(m.id)}>퇴사 처리</button>
                        ))}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {PERM_GROUPS.map((g) => (
              <tbody key={g.group} className={`t-${g.tone}`}>
                <tr className="grow"><th colSpan={members.length + 1} scope="colgroup"><span className="gbar" />{g.group}</th></tr>
                {g.keys.map((k) => (
                  <tr key={k.key}>
                    <th scope="row" className="pk">{k.label}</th>
                    {members.map((m, mi) => {
                      const v = (m.permissions[k.key] ?? "none") as Perm;
                      return (
                        <td key={m.id} className={`pc${m.status === "invited" ? " invited" : ""}${mi % 2 ? " alt" : ""}`}>
                          <button type="button" disabled={m.role === "owner" || !canEdit || (!isOwner && m.id === myId)} className={`pv ${v}`} onClick={() => cycle(m, k.key, k.own)}
                            aria-label={`${m.display_name} ${k.label}: ${PERM_LABEL[v]}`}>{PERM_LABEL[v]}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="foot sm">
          직함은 원장님이 직접 입력해요. 이름 아래 <b>✎ 직함</b>을 누르면 고칠 수 있어요 (예: 디자이너 → 부원장). 직함은 예약 · 고객 앱에 보이는 이름표이고, 권한은 표에서 따로 정해요. 표를 직접 고치면 기본 권한이 ‘직접 설정’으로 바뀌어요. 모든 변경은 이력에 남아요.
        </p>
      </div>

      {showLog && (
        <div className="card">
          <h2 className="b" style={{ marginBottom: 8 }}>권한 변경 이력 (최근 30건)</h2>
          <ul className="list">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="sm" style={{ minWidth: 92 }}>{new Date(l.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="b">{nameOf(l.target_id)}</span>
                <span>{describe(l)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function describe(l: Log) {
  const b = l.before ?? {}, a = l.after ?? {};
  if (l.action === "member.title") return `직함 ${b.title} → ${a.title}`;
  if (l.action === "member.status") return a.status === "left" ? "퇴사 처리" : `상태 ${b.status} → ${a.status}`;
  const changed = PERM_KEYS.filter((k) => (b.permissions?.[k.key] ?? "none") !== (a.permissions?.[k.key] ?? "none"))
    .map((k) => `${k.label} ${PERM_LABEL[(b.permissions?.[k.key] ?? "none") as Perm]}→${PERM_LABEL[(a.permissions?.[k.key] ?? "none") as Perm]}`);
  const role = b.role !== a.role ? `기본 권한 ${roleLabel(b.role ?? "")} → ${roleLabel(a.role ?? "")}` : "";
  return [role, ...changed].filter(Boolean).join(" · ") || "권한 변경";
}
