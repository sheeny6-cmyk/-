import { useState, useEffect, useCallback, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

/* ─── constants ─── */
const STORE_CATEGORIES = {
  "배달의민족": "배달", "요기요": "배달", "쿠팡이츠": "배달",
  "쿠팡": "온라인쇼핑", "네이버페이": "온라인쇼핑", "11번가": "온라인쇼핑", "G마켓": "온라인쇼핑", "옥션": "온라인쇼핑", "위메프": "온라인쇼핑", "티몬": "온라인쇼핑",
  "무신사": "패션", "에이블리": "패션", "지그재그": "패션", "29CM": "패션", "W컨셉": "패션",
  "올리브영": "뷰티", "시코르": "뷰티", "세포라": "뷰티",
  "스타벅스": "카페", "투썸플레이스": "카페", "이디야": "카페", "메가커피": "카페", "컴포즈": "카페", "빽다방": "카페", "할리스": "카페", "폴바셋": "카페", "블루보틀": "카페",
  "GS25": "편의점", "CU": "편의점", "세븐일레븐": "편의점", "이마트24": "편의점",
  "이마트": "마트", "홈플러스": "마트", "롯데마트": "마트", "트레이더스": "마트", "코스트코": "마트",
  "넷플릭스": "구독", "유튜브": "구독", "멜론": "구독", "스포티파이": "구독", "웨이브": "구독", "티빙": "구독", "쿠팡플레이": "구독", "디즈니": "구독", "왓챠": "구독",
  "카카오택시": "교통", "타다": "교통", "티머니": "교통",
  "다이소": "생활", "이케아": "생활", "오늘의집": "생활",
  "CGV": "문화", "메가박스": "문화", "롯데시네마": "문화",
  "약국": "의료", "병원": "의료", "의원": "의료",
};

const CATEGORY_META = {
  "배달": { emoji: "🛵", color: "#FF6B35" },
  "온라인쇼핑": { emoji: "📦", color: "#4ECDC4" },
  "패션": { emoji: "👗", color: "#C77DFF" },
  "뷰티": { emoji: "💄", color: "#FF69B4" },
  "카페": { emoji: "☕", color: "#D4A574" },
  "편의점": { emoji: "🏪", color: "#45B7D1" },
  "마트": { emoji: "🛒", color: "#96CEB4" },
  "구독": { emoji: "📺", color: "#6C5CE7" },
  "교통": { emoji: "🚕", color: "#FDCB6E" },
  "생활": { emoji: "🏠", color: "#00B894" },
  "외식": { emoji: "🍽️", color: "#E17055" },
  "문화": { emoji: "🎬", color: "#fd79a8" },
  "의료": { emoji: "🏥", color: "#74B9FF" },
  "기타": { emoji: "💳", color: "#636E72" },
};

const TRANSFER_KW = ["이체", "송금", "입금", "자동이체", "본인이체", "타행이체"];
const POINT_KW = ["포인트", "캐시백", "적립금", "마일리지", "리워드"];
const CARD_BILL_KW = ["카드대금", "카드결제대금", "결제대금", "카드출금"];
const CARDS = ["신한", "삼성", "현대", "KB", "국민", "롯데", "우리", "하나", "BC", "NH", "카카오", "토스", "체크"];

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (n) => n.toLocaleString("ko-KR");

function parseNotification(text) {
  const results = [];
  for (const line of text.split("\n").map(l => l.trim()).filter(Boolean)) {
    const am = line.match(/([\d,]+)\s*원/);
    if (!am) continue;
    const amount = parseInt(am[1].replace(/,/g, ""), 10);
    if (!amount) continue;
    let card = ""; for (const c of CARDS) { if (line.includes(c)) { card = c; break; } }
    let store = "";
    for (const p of [/(?:승인|결제|사용)\s+(.+?)\s+[\d,]+원/, /[\d,]+원\s+(.+?)(?:\s|$)/]) {
      const m = line.match(p);
      if (m?.[1] && m[1].length < 20) { store = m[1].replace(/[*\[\]]/g, "").trim(); break; }
    }
    const isT = TRANSFER_KW.some(k => line.includes(k));
    const isP = POINT_KW.some(k => line.includes(k));
    const isCB = CARD_BILL_KW.some(k => line.includes(k));
    let date = new Date().toISOString().slice(0, 10);
    const dm = line.match(/(\d{1,2})\/(\d{1,2})/);
    if (dm) date = `${new Date().getFullYear()}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
    let category = "기타";
    for (const [key, cat] of Object.entries(STORE_CATEGORIES)) {
      if (store.includes(key) || line.includes(key)) { category = cat; if (!store) store = key; break; }
    }
    results.push({
      id: genId(), raw: line, amount, card, store: store || "미확인",
      category, date, timestamp: Date.now(),
      type: isCB ? "card_bill" : isT ? "transfer" : isP ? "point" : "expense",
      excluded: isT || isP,
    });
  }
  return results;
}

function isDup(arr, n) {
  return arr.some(e => e.amount === n.amount && e.store === n.store && e.date === n.date && e.card === n.card);
}

const SK = "expense-tracker-v2";
async function load() { try { const r = await window.storage.get(SK); return r ? JSON.parse(r.value) : []; } catch { return []; } }
async function save(d) { try { await window.storage.set(SK, JSON.stringify(d)); } catch {} }

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1E1E2A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ddd" }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#fff" }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value)}원</div>)}
    </div>
  );
}

const font = `'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif`;
const inputBase = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, padding: "12px 14px", color: "#E8E6E1", fontSize: 13,
  fontFamily: font, outline: "none", boxSizing: "border-box", width: "100%",
};

export default function App() {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("input");
  const [notif, setNotif] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "" });
  const [manual, setManual] = useState({ store: "", amount: "", category: "기타", card: "", date: new Date().toISOString().slice(0, 10), type: "expense" });

  useEffect(() => { load().then(d => { setItems(d); setReady(true); }); }, []);
  useEffect(() => { if (ready) save(items); }, [items, ready]);

  const flash = useCallback((m) => { setToast({ show: true, msg: m }); setTimeout(() => setToast({ show: false, msg: "" }), 2500); }, []);

  const expenses = useMemo(() => items.filter(i => i.type === "expense" && !i.excluded), [items]);
  const cardBills = useMemo(() => items.filter(i => i.type === "card_bill"), [items]);
  const excluded = useMemo(() => items.filter(i => i.excluded), [items]);
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const totalCB = cardBills.reduce((s, e) => s + e.amount, 0);

  const catData = useMemo(() => {
    const m = {}; expenses.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({
      name, value, color: CATEGORY_META[name]?.color || "#636E72", emoji: CATEGORY_META[name]?.emoji || "💳",
    }));
  }, [expenses]);

  const storeTop = useMemo(() => {
    const m = {}; expenses.forEach(e => { m[e.store] = (m[e.store] || 0) + e.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, amount]) => ({ name, amount }));
  }, [expenses]);

  const dailyData = useMemo(() => {
    const m = {}; expenses.forEach(e => { m[e.date] = (m[e.date] || 0) + e.amount; });
    return Object.entries(m).sort().map(([date, amount]) => ({ date: date.slice(5), amount }));
  }, [expenses]);

  const cardUsage = useMemo(() => {
    const m = {}; expenses.forEach(e => { if (e.card) m[e.card] = (m[e.card] || 0) + e.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name: name + "카드", amount }));
  }, [expenses]);

  const doParse = () => {
    if (!notif.trim()) return;
    const parsed = parseNotification(notif);
    if (!parsed.length) { flash("⚠️ 인식된 내역 없음"); return; }
    let added = 0, dup = 0; const next = [...items];
    for (const p of parsed) { if (isDup(next, p)) dup++; else { next.push(p); added++; } }
    setItems(next); setNotif("");
    flash(dup ? `✅ ${added}건 추가 · ⚠️ ${dup}건 중복 제외` : `✅ ${added}건 추가`);
  };

  const doManual = () => {
    if (!manual.store || !manual.amount) { flash("⚠️ 가게명과 금액 필요"); return; }
    const amount = parseInt(manual.amount.replace(/,/g, ""), 10);
    if (!amount) { flash("⚠️ 금액 확인"); return; }
    const isT = TRANSFER_KW.some(k => manual.store.includes(k));
    const isP = POINT_KW.some(k => manual.store.includes(k));
    const isCB = manual.type === "card_bill";
    const n = {
      id: genId(), raw: "", amount, card: manual.card, store: manual.store,
      category: manual.category, date: manual.date, timestamp: Date.now(),
      type: isCB ? "card_bill" : isT ? "transfer" : isP ? "point" : "expense",
      excluded: isT || isP,
    };
    if (isDup(items, n)) { flash("⚠️ 중복"); return; }
    setItems([...items, n]);
    setManual({ store: "", amount: "", category: "기타", card: "", date: new Date().toISOString().slice(0, 10), type: "expense" });
    flash("✅ 추가 완료");
  };

  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  const sample = `[신한] 03/01 스타벅스 5,500원 승인
[삼성] 03/01 쿠팡 32,000원 승인
[KB] 03/01 배달의민족 18,500원 승인
[현대] 03/02 올리브영 28,900원 승인
[신한] 03/02 CGV 14,000원 승인
[삼성] 03/03 GS25 3,200원 승인
[KB] 03/03 넷플릭스 17,000원 승인
[신한] 03/01 본인이체 500,000원
[삼성] 카드대금 1,250,000원 출금`;

  if (!ready) return (
    <div style={{ fontFamily: font, minHeight: "100vh", background: "#0F0F14", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 36, marginBottom: 10 }}>💰</div>불러오는 중...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: font, minHeight: "100vh", background: "#0F0F14", color: "#E8E6E1", maxWidth: 480, margin: "0 auto", paddingBottom: 90 }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />

      {/* header */}
      <div style={{ background: "linear-gradient(160deg, #1A1A26, #111118)", padding: "32px 24px 20px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#555", letterSpacing: "0.12em" }}>나의 가계부</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#F5F5F0", marginTop: 4, letterSpacing: "-0.02em" }}>{monthLabel}</div>
      </div>

      {/* summary cards */}
      <div style={{ display: "flex", gap: 10, padding: "16px 20px" }}>
        <div style={{ flex: 1, background: "linear-gradient(135deg, rgba(168,85,247,0.1), rgba(108,92,231,0.04))", border: "1px solid rgba(168,85,247,0.13)", borderRadius: 16, padding: "20px 16px" }}>
          <div style={{ fontSize: 11, color: "#A855F7", fontWeight: 600, marginBottom: 8 }}>실제 지출</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#F5F5F0" }}>{fmt(totalExp)}<span style={{ fontSize: 13, fontWeight: 500 }}>원</span></div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>{expenses.length}건</div>
        </div>
        <div style={{ flex: 1, background: "rgba(255,107,53,0.05)", border: "1px solid rgba(255,107,53,0.1)", borderRadius: 16, padding: "20px 16px" }}>
          <div style={{ fontSize: 11, color: "#FF6B35", fontWeight: 600, marginBottom: 8 }}>카드대금</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#F5F5F0" }}>{fmt(totalCB)}<span style={{ fontSize: 13, fontWeight: 500 }}>원</span></div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>{cardBills.length ? `${cardBills.length}건` : "없음"}</div>
        </div>
      </div>

      {excluded.length > 0 && (
        <div style={{ margin: "0 20px 8px", padding: "9px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, fontSize: 11, color: "#555" }}>
          🚫 이체·포인트 {excluded.length}건 자동 제외 ({fmt(excluded.reduce((s, i) => s + i.amount, 0))}원)
        </div>
      )}

      {/* bottom tab bar */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: "#0F0F14", borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "10px 20px 16px", zIndex: 50, boxSizing: "border-box", display: "flex", gap: 6,
      }}>
        {[["input", "📋", "입력"], ["list", "📝", "내역"], ["stats", "📊", "분석"]].map(([k, ic, lb]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "10px 0", textAlign: "center",
            background: tab === k ? "rgba(168,85,247,0.13)" : "rgba(255,255,255,0.03)",
            border: tab === k ? "1px solid rgba(168,85,247,0.25)" : "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12, cursor: "pointer", fontSize: 12,
            fontWeight: tab === k ? 700 : 400, color: tab === k ? "#D4AAFF" : "#555",
            fontFamily: font, transition: "all 0.2s",
          }}>
            {ic} {lb}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 20px" }}>

        {/* ═══ INPUT ═══ */}
        {tab === "input" && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: "0.06em", marginBottom: 12 }}>결제 알림 붙여넣기</div>
            <textarea style={{ ...inputBase, minHeight: 130, resize: "vertical", lineHeight: 1.7 }}
              value={notif} onChange={e => setNotif(e.target.value)}
              placeholder={`카드 결제 알림 문자를 붙여넣으세요\n\n예시:\n${sample}`} />
            <button onClick={doParse} style={{
              width: "100%", padding: 14, background: "linear-gradient(135deg, #6C5CE7, #A855F7)",
              color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: "pointer", marginTop: 10, fontFamily: font,
            }}>분석하기</button>

            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "24px 0" }} />

            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: "0.06em", marginBottom: 12 }}>직접 입력</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={inputBase} placeholder="가게명 (예: 스타벅스 강남점)" value={manual.store} onChange={e => setManual({ ...manual, store: e.target.value })} />
              <input style={inputBase} placeholder="금액 (숫자만)" inputMode="numeric" value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value.replace(/[^\d]/g, "") })} />
              <div style={{ display: "flex", gap: 8 }}>
                <select style={{ ...inputBase, flex: 1, appearance: "none" }} value={manual.category} onChange={e => setManual({ ...manual, category: e.target.value })}>
                  {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.emoji} {k}</option>)}
                </select>
                <select style={{ ...inputBase, flex: 1, appearance: "none" }} value={manual.type} onChange={e => setManual({ ...manual, type: e.target.value })}>
                  <option value="expense">💰 지출</option>
                  <option value="card_bill">💳 카드대금</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputBase, flex: 1 }} placeholder="카드 (선택)" value={manual.card} onChange={e => setManual({ ...manual, card: e.target.value })} />
                <input style={{ ...inputBase, flex: 1 }} type="date" value={manual.date} onChange={e => setManual({ ...manual, date: e.target.value })} />
              </div>
              <button onClick={doManual} style={{
                width: "100%", padding: 14, background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)", color: "#E8E6E1", borderRadius: 12,
                fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font,
              }}>추가하기</button>
            </div>

            <div style={{
              marginTop: 20, padding: 16, background: "rgba(108,92,231,0.04)",
              border: "1px solid rgba(108,92,231,0.08)", borderRadius: 12,
              fontSize: 12, color: "#666", lineHeight: 2,
            }}>
              <div style={{ fontWeight: 700, color: "#A855F7", marginBottom: 4, fontSize: 13 }}>💡 자동 분류 규칙</div>
              <div>🚫 이체·송금 → 지출에서 자동 제외</div>
              <div>🚫 포인트·캐시백 → 지출에서 자동 제외</div>
              <div>💳 카드대금 → 별도 분류 (지출 아님)</div>
              <div>🔄 같은 날짜+가게+금액+카드 → 중복 방지</div>
              <div>🏷️ 50+ 가게 자동 카테고리 매칭</div>
            </div>
          </div>
        )}

        {/* ═══ LIST ═══ */}
        {tab === "list" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>전체 내역 ({items.length}건)</div>
              {items.length > 0 && (
                <button onClick={() => { if (confirm("모든 내역을 삭제할까요?")) setItems([]); }} style={{
                  background: "rgba(255,99,82,0.08)", border: "1px solid rgba(255,99,82,0.12)",
                  color: "#FF6352", borderRadius: 8, padding: "5px 12px",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font,
                }}>전체 삭제</button>
              )}
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#444" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
                <div style={{ fontSize: 14, lineHeight: 1.8 }}>아직 내역이 없어요<br />알림 붙여넣기 또는 직접 입력해보세요</div>
              </div>
            ) : (
              [...items].sort((a, b) => b.timestamp - a.timestamp).map(item => {
                const meta = CATEGORY_META[item.category] || CATEGORY_META["기타"];
                const isCB = item.type === "card_bill";
                const ex = item.excluded;
                return (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: ex ? 0.35 : 1,
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: `${isCB ? "#FF6B35" : meta.color}12`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 17, flexShrink: 0,
                    }}>{isCB ? "💳" : meta.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.store}
                        {isCB && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "#FF6B3518", color: "#FF6B35" }}>카드대금</span>}
                        {item.type === "transfer" && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "#45B7D118", color: "#45B7D1" }}>이체</span>}
                        {item.type === "point" && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "#FDCB6E18", color: "#FDCB6E" }}>포인트</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                        {item.date}{item.card && ` · ${item.card}`} · {item.category}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 15, fontWeight: 700, flexShrink: 0,
                      color: ex ? "#555" : isCB ? "#FF6B35" : "#F5F5F0",
                      textDecoration: ex ? "line-through" : "none",
                    }}>{fmt(item.amount)}원</div>
                    <button onClick={() => setItems(items.filter(i => i.id !== item.id))} style={{
                      background: "none", border: "none", color: "#444", cursor: "pointer",
                      fontSize: 16, padding: "4px 6px", fontFamily: font,
                    }}>×</button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {tab === "stats" && (
          <div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#444" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <div style={{ fontSize: 14, lineHeight: 1.8 }}>지출 데이터가 쌓이면<br />여기서 분석을 볼 수 있어요</div>
              </div>
            ) : (
              <>
                {/* 도넛차트 */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>카테고리별 지출 비중</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                        {catData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px", marginTop: 10 }}>
                    {catData.map(d => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#999" }}>
                        <div style={{ width: 8, height: 8, borderRadius: 3, background: d.color }} />
                        {d.emoji} {d.name} <span style={{ color: "#555" }}>({Math.round(d.value / totalExp * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 카테고리 바 */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>카테고리별 금액</div>
                  <ResponsiveContainer width="100%" height={Math.max(catData.length * 40, 100)}>
                    <BarChart data={catData} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={62} tick={{ fill: "#999", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <Bar dataKey="value" name="지출" radius={[0, 6, 6, 0]} barSize={18}>
                        {catData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 일별 추이 */}
                {dailyData.length > 1 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>일별 지출 추이</div>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={dailyData} margin={{ left: 0, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip content={<ChartTip />} />
                        <Line type="monotone" dataKey="amount" name="지출" stroke="#A855F7" strokeWidth={2.5}
                          dot={{ fill: "#A855F7", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#A855F7" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 카드별 */}
                {cardUsage.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>카드별 사용액</div>
                    <ResponsiveContainer width="100%" height={Math.max(cardUsage.length * 40, 60)}>
                      <BarChart data={cardUsage} layout="vertical" margin={{ left: 8, right: 8 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={62} tick={{ fill: "#999", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Bar dataKey="amount" name="사용액" fill="#6C5CE7" radius={[0, 6, 6, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 가게 TOP */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 12 }}>많이 쓴 곳 TOP {storeTop.length}</div>
                  {storeTop.map((s, i) => (
                    <div key={s.name} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      borderBottom: i < storeTop.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 7,
                        background: i < 3 ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: i < 3 ? "#A855F7" : "#555",
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#ccc" }}>{s.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F0" }}>{fmt(s.amount)}원</div>
                    </div>
                  ))}
                </div>

                {/* 지출 vs 카드대금 비교 */}
                {totalCB > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>지출 vs 카드대금</div>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={[{ name: "비교", expense: totalExp, bill: totalCB }]} layout="vertical" margin={{ left: 8, right: 8 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="expense" name="실제 지출" fill="#A855F7" radius={[6, 6, 6, 6]} barSize={24} />
                        <Bar dataKey="bill" name="카드대금" fill="#FF6B35" radius={[6, 6, 6, 6]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10, fontSize: 11, color: "#888" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 3, background: "#A855F7" }} /> 실제 지출 {fmt(totalExp)}원
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 3, background: "#FF6B35" }} /> 카드대금 {fmt(totalCB)}원
                      </div>
                    </div>
                    <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "#555" }}>
                      ※ 카드대금은 이전 달 사용분이므로 이번 달 지출과 다를 수 있어요
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* toast */}
      <div style={{
        position: "fixed", bottom: toast.show ? 85 : -60, left: "50%", transform: "translateX(-50%)",
        background: "#1E1E2A", border: "1px solid rgba(168,85,247,0.2)",
        color: "#ddd", padding: "10px 20px", borderRadius: 12,
        fontSize: 13, fontWeight: 600, transition: "bottom 0.3s ease",
        zIndex: 100, whiteSpace: "nowrap", fontFamily: font,
      }}>{toast.msg}</div>
    </div>
  );
}