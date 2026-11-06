"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { DURATIONS, EXTENSION_TEMPLATE, HAIR_TEMPLATE, KINDS, kindOf, priceFor, type Category, type Item, type MenuKind } from "@/src/lib/menu";
import "./menu.css";

type Props = { shopId: string; shopName: string; canEdit: boolean; initialCats: Category[]; initialItems: Item[]; lengthMode: "item" | "extension" };
/** 분류를 새로 만들 때 고를 수 있는 종류 (기장은 전용 버튼으로만) */
const PICK_KINDS = KINDS.filter((k) => k.value !== "extension");

const won = (n: number | null) => (n == null ? "" : n.toLocaleString("ko-KR"));
const fmtMin = (m: number) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`);
const toInt = (v: string) => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export default function MenuEditor({ shopId, shopName, canEdit, initialCats, initialItems, lengthMode: initMode }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [cats, setCats] = useState(initialCats);
  const [items, setItems] = useState(initialItems);
  const [sel, setSel] = useState<string | null>(initialCats[0]?.id ?? null);
  const [kindTab, setKindTab] = useState<MenuKind | "all">((initialCats[0]?.kind as MenuKind) ?? "all");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<MenuKind>("cut");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(initMode);
  const extCat = cats.find((c) => c.kind === "extension") ?? null;

  const cat = cats.find((c) => c.id === sel) ?? null;
  const itemsOf = (cid: string) => items
    .filter((i) => i.category_id === cid && (!q || i.name.includes(q.trim())))
    .sort((a, b) => a.sort_order - b.sort_order);
  /** 종류 탭: 그 종류의 모든 1차 분류 → 상세메뉴를 아래로 쭉 */
  const tabCats = cats.filter((c) => kindTab === "all" || c.kind === kindTab);
  const kindCount = (k: MenuKind) => items.filter((i) => cats.find((c) => c.id === i.category_id)?.kind === k).length;
  function pickCat(id: string) {
    const c = cats.find((x) => x.id === id);
    setSel(id);
    if (c) setKindTab(c.kind as MenuKind);
    setTimeout(() => document.getElementById(`grp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function done(err: { message: string } | null, okText = "저장됨") {
    const t = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setStatus(err ? { kind: "err", text: `저장 실패: ${err.message}` } : { kind: "ok", text: `${okText} · ${t}` });
  }

  // ---------- 1차 분류 ----------
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { setAddErr("분류 이름을 고르거나 직접 입력해주세요."); return; }
    if (cats.some((c) => c.name === newName.trim())) { setAddErr(`‘${newName.trim()}’ 분류가 이미 있어요.`); return; }
    setAddErr(null);
    setBusy(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .insert({ shop_id: shopId, name: newName.trim(), kind: newKind, default_duration_min: kindOf(newKind).minutes, sort_order: (cats.at(-1)?.sort_order ?? 0) + 1 })
      .select("id, name, kind, point_earn, point_use, grade_discount, default_duration_min, sort_order")
      .single();
    setBusy(false);
    done(error, "분류 추가됨");
    if (data) {
      setCats([...cats, data as Category]);
      setSel(data.id);
      setKindTab(data.kind as MenuKind);
      setNewName("");
      setAdding(false);
    }
  }

  async function patchCat(id: string, patch: Partial<Category>) {
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("menu_categories").update(patch).eq("id", id);
    done(error);
  }

  async function moveCat(id: string, dir: -1 | 1) {
    const i = cats.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const a = cats[i], b = cats[j];
    const next = [...cats];
    next[i] = { ...b, sort_order: a.sort_order };
    next[j] = { ...a, sort_order: b.sort_order };
    if (a.sort_order === b.sort_order) next[j].sort_order = a.sort_order + dir;
    setCats(next);
    const r1 = await supabase.from("menu_categories").update({ sort_order: next[i].sort_order }).eq("id", next[i].id);
    const r2 = await supabase.from("menu_categories").update({ sort_order: next[j].sort_order }).eq("id", next[j].id);
    done(r1.error ?? r2.error, "순서 변경됨");
  }

  async function deleteCat(id: string) {
    if (items.some((i) => i.category_id === id)) {
      setStatus({ kind: "err", text: "2차 메뉴가 남아 있어 분류를 지울 수 없어요. 메뉴를 먼저 지우거나 다른 분류로 옮겨주세요." });
      return;
    }
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    done(error, "분류 삭제됨");
    if (!error) {
      const rest = cats.filter((c) => c.id !== id);
      setCats(rest);
      setSel(rest[0]?.id ?? null);
    }
  }

  // ---------- 2차 메뉴 ----------
  async function addItem(cid?: string) {
    const target = cats.find((c) => c.id === (cid ?? sel));
    if (!target) return;
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ shop_id: shopId, category_id: target.id, name: "새 메뉴", price: 0, sort_order: (items.filter((i) => i.category_id === target.id).at(-1)?.sort_order ?? 0) + 1 })
      .select("id, category_id, name, price, price_m, price_l, duration_min, status, sort_order")
      .single();
    done(error, "메뉴 추가됨");
    if (data) setItems([...items, data as Item]);
  }

  async function patchItem(id: string, patch: Partial<Item>) {
    setItems((is) => is.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    done(error);
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    done(error, "메뉴 삭제됨");
    if (!error) setItems(items.filter((i) => i.id !== id));
  }

  /** S-08 기장 분류 추가: 소요시간 0분 · 기장 M/L 옵션(금액만) → 결제 화면은 기장 분류 방식으로 */
  async function addExtension() {
    setBusy(true);
    const { data: c, error } = await supabase.from("menu_categories")
      .insert({ shop_id: shopId, name: "기장", kind: "extension", default_duration_min: 0, point_earn: true, point_use: true, grade_discount: false, sort_order: (cats.at(-1)?.sort_order ?? 0) + 1 })
      .select("id, name, kind, point_earn, point_use, grade_discount, default_duration_min, sort_order").single();
    if (error || !c) { setBusy(false); done(error ?? { message: "분류 생성 실패" }); return; }
    const { data: its } = await supabase.from("menu_items")
      .insert(EXTENSION_TEMPLATE.map(([name, price], k) => ({ shop_id: shopId, category_id: c.id, name, price, duration_min: 0, sort_order: k + 1 })))
      .select("id, category_id, name, price, price_m, price_l, duration_min, status, sort_order");
    setCats((cs) => [...cs, c as Category]);
    setItems((is) => [...is, ...((its ?? []) as Item[])]);
    setSel(c.id); setKindTab("extension");
    setBusy(false);
    await changeMode("extension", "기장 분류를 추가했어요. 금액만 고치면 돼요");
  }
  async function changeMode(m: "item" | "extension", okText = "기장 금액 방식을 바꿨어요") {
    const { error } = await supabase.rpc("set_length_mode", { p_shop: shopId, p_mode: m });
    if (!error) setMode(m);
    done(error, okText);
  }

  async function loadTemplate() {
    setBusy(true);
    const newCats: Category[] = [];
    const newItems: Item[] = [];
    for (const [ci, t] of HAIR_TEMPLATE.entries()) {
      const { data: c, error } = await supabase
        .from("menu_categories")
        .insert({ shop_id: shopId, name: t.name, kind: t.kind, default_duration_min: kindOf(t.kind).minutes, sort_order: ci + 1 })
        .select("id, name, kind, point_earn, point_use, grade_discount, default_duration_min, sort_order")
        .single();
      if (error || !c) { done(error ?? { message: "분류 생성 실패" }); setBusy(false); return; }
      newCats.push(c as Category);
      const { data: its } = await supabase
        .from("menu_items")
        .insert(t.items.map(([name, price, dur], k) => ({ shop_id: shopId, category_id: c.id, name, price, duration_min: dur ?? null, sort_order: k + 1 })))
        .select("id, category_id, name, price, price_m, price_l, duration_min, status, sort_order");
      newItems.push(...((its ?? []) as Item[]));
    }
    setCats(newCats);
    setItems(newItems);
    setSel(newCats[0]?.id ?? null);
    setBusy(false);
    done(null, "기본 메뉴 불러옴");
  }

  const ro = !canEdit;

  return (
    <div className="mm-page">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div>
          <p className="crumb"><a href="/desk/settings" className="back">← 설정</a> · 시술 메뉴 · {shopName}</p>
          <h1 className="h1">시술 메뉴 등록 및 관리</h1>
        </div>
        <span className="sp" />
        {status && <span className={`mm-status ${status.kind}`} role="status">{status.text}</span>}
      </div>

      {ro && <p className="msg warnbar">보기 전용이에요. 원장님이 구성원 · 권한에서 &lsquo;시술 메뉴&rsquo; 권한을 주면 수정할 수 있어요.</p>}

      {cats.length === 0 ? (
        <div className="card mm-empty">
          <h2 className="b">아직 등록된 시술 메뉴가 없어요</h2>
          <p className="sm">헤어 기본 메뉴(컷 · 펌 · 열펌 · 염색 · 클리닉 · 드라이)를 불러온 뒤 가격만 고치면 빨라요. 직접 1차 분류부터 만들어도 돼요.</p>
          {!ro && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn pri" type="button" disabled={busy} onClick={loadTemplate}>{busy ? "불러오는 중…" : "헤어 기본 메뉴 불러오기"}</button>
              <button className="btn ghost" type="button" onClick={() => setAdding(true)}>직접 만들기</button>
            </div>
          )}
          {adding && <AddCatForm {...{ newName, setNewName, newKind, setNewKind, addCat, busy, err: addErr, existing: cats.map((c) => c.name), cancel: () => { setAdding(false); setAddErr(null); } }} />}
        </div>
      ) : (
        <>
        {extCat && (
          <div className="card ext-mode" role="radiogroup" aria-label="기장 금액 방식">
            <b>기장 금액은 어떻게 받을까요?</b>
            <label className={mode === "extension" ? "on" : ""}><input type="radio" name="lenmode" checked={mode === "extension"} disabled={ro} onChange={() => changeMode("extension")} />
              <span><b>기장 분류 옵션</b> <span className="sm">예약 · 결제에서 ‘기장 M · L’을 골라 금액만 더해요 (권장)</span></span></label>
            <label className={mode === "item" ? "on" : ""}><input type="radio" name="lenmode" checked={mode === "item"} disabled={ro} onChange={() => changeMode("item")} />
              <span><b>메뉴별 M · L 추가금</b> <span className="sm">메뉴마다 적은 추가금을 결제에서 M · L 로 골라요</span></span></label>
            <p className="sm">두 번 더해지지 않게 결제 화면에는 고른 방식 하나만 보여요.</p>
          </div>
        )}
        <div className="mm">
          {/* ① 1차 분류 */}
          <section className="card mm-l" aria-label="1차 분류">
            <div className="lh">
              <h2 className="b">① 1차 분류</h2>
              <span className="pill p-gray">{cats.length}개</span>
              <span className="sp" />
              {!ro && <button className="btn sm-btn" type="button" onClick={() => setAdding((v) => !v)}>+ 추가</button>}
            </div>
            {adding && <AddCatForm {...{ newName, setNewName, newKind, setNewKind, addCat, busy, err: addErr, existing: cats.map((c) => c.name), cancel: () => { setAdding(false); setAddErr(null); } }} />}
            <ul className="cats">
              {cats.map((c, idx) => {
                const k = kindOf(c.kind);
                const n = items.filter((i) => i.category_id === c.id).length;
                return (
                  <li key={c.id} className={`cat${c.id === sel ? " on" : ""}`}>
                    <button type="button" className="cat-main" onClick={() => pickCat(c.id)} aria-pressed={c.id === sel}>
                      <span className="dot" style={{ background: k.color }} />
                      <span style={{ minWidth: 0 }}>
                        <span className="nm">{c.name}</span>
                        <span className="ds">{c.kind === "extension" ? `금액만 · 옵션 ${n}개 · 0분` : `${k.label} · 메뉴 ${n}개 · 기본 ${c.default_duration_min}분`}</span>
                      </span>
                    </button>
                    {!ro && (
                      <span className="mv">
                        <button type="button" aria-label={`${c.name} 위로`} disabled={idx === 0} onClick={() => moveCat(c.id, -1)}>▲</button>
                        <button type="button" aria-label={`${c.name} 아래로`} disabled={idx === cats.length - 1} onClick={() => moveCat(c.id, 1)}>▼</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!ro && !extCat && <button type="button" className="btn ghost wide ext-add" disabled={busy} onClick={addExtension}>+ 기장 분류 추가 (M · L 금액만)</button>}
            <p className="lf sm">분류를 누르면 위에서 설정을 바꾸고, 아래 ② 에서 그 분류의 상세메뉴로 이동해요.</p>
          </section>

          {/* ② 선택한 분류 설정 + 2차 메뉴 */}
          {cat && (
            <section className="mm-r" aria-label={`${cat.name} 상세`}>
              <div className="card cat-set">
                <h2 className="b set-title"><span className="dot" style={{ background: kindOf(cat.kind).color }} /> {cat.name} 분류 설정</h2>
                <div className="strip">
                  <label className="fl">
                    <span className="lbl">분류 이름</span>
                    <input key={cat.id + "n"} className="input" defaultValue={cat.name} disabled={ro} maxLength={20}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== cat.name && patchCat(cat.id, { name: e.target.value.trim() })} />
                  </label>
                  <label className="fl">
                    <span className="lbl">종류 (캘린더 색 · 통계 기준)</span>
                    {cat.kind === "extension" ? <input className="input" value="기장 (금액만 더함)" disabled /> : (
                      <select className="input" value={cat.kind} disabled={ro}
                        onChange={(e) => { patchCat(cat.id, { kind: e.target.value as MenuKind }); setKindTab(e.target.value as MenuKind); }}>
                        {PICK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                    )}
                  </label>
                  {cat.kind === "extension" ? (
                    <div className="fl"><span className="lbl">소요시간</span><p className="ext-note">0분 고정 · 예약 시간은 늘지 않고 <b>금액만</b> 더해져요</p></div>
                  ) : (
                  <label className="fl">
                    <span className="lbl">기본 소요시간</span>
                    <select className="input" value={cat.default_duration_min} disabled={ro}
                      onChange={(e) => patchCat(cat.id, { default_duration_min: Number(e.target.value) })}>
                      {DURATIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                    </select>
                  </label>
                  )}
                </div>
                <div className="opts">
                  <Toggle label="포인트 적립" hint="결제 시 적립" on={cat.point_earn} ro={ro} onChange={(v) => patchCat(cat.id, { point_earn: v })} />
                  <Toggle label="포인트 사용" hint="포인트로 결제" on={cat.point_use} ro={ro} onChange={(v) => patchCat(cat.id, { point_use: v })} />
                  <Toggle label="등급 할인" hint="등급별 할인" on={cat.grade_discount} ro={ro} onChange={(v) => patchCat(cat.id, { grade_discount: v })} />
                  {!ro && <button type="button" className="btn ghost del" onClick={() => deleteCat(cat.id)}>분류 삭제</button>}
                </div>
              </div>

              <div className="card mm-items">
                <div className="lh">
                  <h2 className="b">② 상세메뉴</h2>
                  <span className="sp" />
                  <input className="input search" placeholder="메뉴 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="메뉴 검색" />
                </div>
                <div className="ktabs" role="tablist" aria-label="종류별 상세메뉴">
                  <button type="button" role="tab" aria-selected={kindTab === "all"} className={`ktab${kindTab === "all" ? " on" : ""}`} onClick={() => setKindTab("all")}>전체 <b>{items.length}</b></button>
                  {KINDS.filter((k) => cats.some((c) => c.kind === k.value)).map((k) => (
                    <button key={k.value} type="button" role="tab" aria-selected={kindTab === k.value} className={`ktab${kindTab === k.value ? " on" : ""}`}
                      style={{ ["--k" as string]: k.color }} onClick={() => setKindTab(k.value)}>
                      <span className="dot" style={{ background: k.color }} />{k.label} <b>{kindCount(k.value)}</b>
                    </button>
                  ))}
                </div>
                <div className="tw">
                  <table className="mt">
                    <thead>
                      <tr><th>메뉴 이름</th><th className="num">결제 금액</th><th className="num">기장 M 추가금</th><th className="num">기장 L 추가금</th><th>소요시간</th><th>판매</th><th aria-label="삭제" /></tr>
                    </thead>
                    {tabCats.map((gc) => {
                      const list = itemsOf(gc.id);
                      if (q && list.length === 0) return null;
                      return (
                        <tbody key={gc.id} id={`grp-${gc.id}`} className={`grp${gc.id === sel ? " cur" : ""}`}>
                          <tr className="gh-row">
                            <td colSpan={7}>
                              <div className="gh-in">
                                <span className="dot" style={{ background: kindOf(gc.kind).color }} />
                                <button type="button" className="gh-name" onClick={() => setSel(gc.id)}>{gc.name}</button>
                                <span className="sm">{list.length}개 · {gc.kind === "extension" ? "금액만 · 0분" : `기본 ${fmtMin(gc.default_duration_min)}`}</span>
                                <span className="sp" />
                                {!ro && <button type="button" className="btn sm-btn" onClick={() => addItem(gc.id)}>+ {gc.kind === "extension" ? "기장 옵션" : `${gc.name} 메뉴`} 추가</button>}
                              </div>
                            </td>
                          </tr>
                          {list.length === 0 && (
                            <tr><td colSpan={7} className="sm empty-row">아직 메뉴가 없어요.</td></tr>
                          )}
                          {list.map((it) => (
                            <tr key={it.id} className={it.status === "paused" ? "off" : ""}>
                              <td className="c-nm"><input aria-label="메뉴 이름" defaultValue={it.name} disabled={ro} maxLength={30}
                                onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && patchItem(it.id, { name: e.target.value.trim() })} /></td>
                              <NumCell label="결제 금액" cls="pr" value={it.price} ro={ro} onSave={(v) => patchItem(it.id, { price: v ?? 0 })} />
                              {gc.kind === "extension" ? (<><td className="num c-pm na" data-label="기장 M 추가금">—</td><td className="num c-pl na" data-label="기장 L 추가금">—</td></>) : (<>
                              <NumCell label="기장 M 추가금" cls={`pm${mode === "extension" ? " dim" : ""}`} value={it.price_m} ro={ro} placeholder="+0" plus
                                total={it.price_m ? priceFor(it, "m") : null} onSave={(v) => patchItem(it.id, { price_m: v || null })} />
                              <NumCell label="기장 L 추가금" cls={`pl${mode === "extension" ? " dim" : ""}`} value={it.price_l} ro={ro} placeholder="+0" plus
                                total={it.price_l ? priceFor(it, "l") : null} onSave={(v) => patchItem(it.id, { price_l: v || null })} />
                              </>)}
                              {gc.kind === "extension" ? <td className="c-du na" data-label="소요시간">0분 고정</td> : (
                              <td className="c-du" data-label="소요시간">
                                <select aria-label={`${it.name} 소요시간`} value={it.duration_min ?? ""} disabled={ro}
                                  className={it.duration_min == null ? "is-default" : ""}
                                  onChange={(e) => patchItem(it.id, { duration_min: e.target.value === "" ? null : Number(e.target.value) })}>
                                  <option value="">기본 {fmtMin(gc.default_duration_min)}</option>
                                  {DURATIONS.map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                                </select>
                              </td>
                              )}
                              <td className="c-st">
                                <button type="button" disabled={ro} className={`pill st ${it.status === "active" ? "p-teal" : "p-gray"}`}
                                  onClick={() => patchItem(it.id, { status: it.status === "active" ? "paused" : "active" })}>
                                  {it.status === "active" ? "판매중" : "숨김"}
                                </button>
                              </td>
                              <td className="c-rm">{!ro && <button type="button" className="rb" aria-label={`${it.name} 삭제`} onClick={() => deleteItem(it.id)}>×</button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      );
                    })}
                  </table>
                  {q && tabCats.every((gc) => itemsOf(gc.id).length === 0) && <p className="sm empty-row">‘{q}’ 검색 결과가 없어요.</p>}
                </div>
                <p className="more sm">칸을 고치고 다른 곳을 누르면 바로 저장돼요 · 기장 M/L 은 결제 금액에 <b>더해지는 추가금</b>이에요 (완료 · 결제에서 M/L 을 누르면 합산) · 소요시간을 ‘기본’으로 두면 분류 기본 시간으로 예약 블록이 잡혀요.</p>
              </div>
            </section>
          )}
        </div>
        </>
      )}
    </div>
  );
}

const NAME_SUGGEST: [string, MenuKind][] = [
  ["첫방문", "etc"], ["컷", "cut"], ["펌", "perm"], ["열펌", "heat_perm"], ["염색", "color"], ["클리닉", "clinic"],
  ["드라이", "dry"], ["옴므", "perm"], ["주니어", "cut"], ["업스타일", "dry"], ["두피", "clinic"], ["정액권", "etc"],
];

function AddCatForm({ newName, setNewName, newKind, setNewKind, addCat, busy, err, existing, cancel }: {
  newName: string; setNewName: (v: string) => void; newKind: MenuKind; setNewKind: (v: MenuKind) => void;
  addCat: (e: React.FormEvent) => void; busy: boolean; err: string | null; existing: string[]; cancel: () => void;
}) {
  return (
    <form className="addf" onSubmit={addCat}>
      <span className="lbl">자주 쓰는 분류</span>
      <div className="chips">
        {NAME_SUGGEST.filter(([n]) => !existing.includes(n)).map(([n, k]) => (
          <button key={n} type="button" className={`chip${newName === n ? " on" : ""}`} onClick={() => { setNewName(n); setNewKind(k); }}>{n}</button>
        ))}
      </div>
      <label className="fl">
        <span className="lbl">직접 입력</span>
        <input id="new-cat-name" className="input" autoFocus placeholder="예: 매직 · 남성펌 · 웨딩" maxLength={20} value={newName} onChange={(e) => setNewName(e.target.value)} />
      </label>
      <span className="lbl">종류 (캘린더 색)</span>
      <div className="chips">
        {PICK_KINDS.map((k) => (
          <button key={k.value} type="button" className={`chip${newKind === k.value ? " on" : ""}`} onClick={() => setNewKind(k.value)}>
            <span className="dot" style={{ background: k.color }} /> {k.label}
          </button>
        ))}
      </div>
      {err && <p className="msg err">{err}</p>}
      <div className="row">
        <button className="btn pri sm-btn" type="submit" disabled={busy}>{busy ? "추가 중…" : "추가"}</button>
        <button className="btn ghost sm-btn" type="button" onClick={cancel}>취소</button>
      </div>
    </form>
  );
}

function Toggle({ label, hint, on, ro, onChange }: { label: string; hint: string; on: boolean; ro: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={ro} className={`mm-opt${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span className="mm-opt-t"><b>{label}</b><span className="sm">{hint}</span></span>
      <span className="mm-sw" aria-hidden><i /></span>
      <span className="mm-opt-v">{on ? "켜짐" : "꺼짐"}</span>
    </button>
  );
}

function NumCell({ label, cls, value, ro, placeholder, plus, total, onSave }: {
  label: string; cls: string; value: number | null; ro: boolean; placeholder?: string; plus?: boolean; total?: number | null;
  onSave: (v: number | null) => void;
}) {
  const show = (v: number | null) => (v == null || (plus && v === 0) ? "" : `${plus ? "+" : ""}${won(v)}`);
  return (
    <td className={`num c-${cls}`} data-label={label}>
      <input
        key={String(value)}
        aria-label={label}
        inputMode="numeric"
        defaultValue={show(value)}
        placeholder={placeholder}
        disabled={ro}
        onFocus={(e) => (e.target.value = e.target.value.replace(/[,+]/g, ""))}
        onBlur={(e) => {
          const v = toInt(e.target.value);
          if (v !== value && !(plus && !v && !value)) onSave(v);
          else e.target.value = show(value);
        }}
      />
      {total != null && <span className="sum">합계 {won(total)}원</span>}
    </td>
  );
}
