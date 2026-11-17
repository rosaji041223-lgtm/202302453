/* 표지(02/00.pdf)의 책들이 왼쪽으로 차례로 쓰러지는 애니메이션 — index.html 표지와 cover-fall.html에서 같이 사용
   - 책 위치는 책장(03/01.pdf)과 표지 사이의 측정 비율(×1.5228)로 계산
   - 각 책은 왼쪽 아래 모서리를 축으로 돌다가, 바닥이나 앞서 쓰러진 책에 닿으면 멈춤 */
(function () {
  const S = 1.5228, TX = -1124.5, TY = -541.6;          // 표지 → 책장 변환값
  const toCover = (x, y) => [(x - TX) / S, (y - TY) / S];
  const FLOOR = toCover(0, 973.5)[1];

  // 책장 화면 기준 책 사각형 [x, y, w, h] — 'lime'은 기울어진 얇은 책
  const SHELF = [
    [322.5, 393.5, 153.5, 580], [496.5, 117, 112, 856.5], [628, 511, 228, 463], 'lime',
    [1015, 222.5, 91.5, 751], [1127, 374, 181, 599.5], [1328, 440, 149, 533.5], [1497, 168, 120, 806],
  ];
  // 책 색 (표지 이미지에서 미리 뽑아 둔 값)
  // ※ 파일을 직접 열면(file://) 브라우저가 이미지 픽셀 읽기를 막아서, 값을 코드에 적어 둠
  const COLORS = ['#000000', '#2226f7', '#ffffff', '#c4ee03', '#ff2e9b', '#cccccc', '#fdd923', '#24d56d'];
  // 기울어진 형광 책의 네 꼭짓점 (표지 좌표)
  const LIME_POLY = [[1307.5, 518.5], [1386, 987], [1364, 992.5], [1286.5, 522]];

  // ── 속도 조절 ──  (숫자가 작을수록 빠름)
  const HOLD_START = 0.15;     // 처음 멈춰 있는 시간 — 들어오자마자 거의 바로 쓰러지기 시작 (쓰러지는 속도는 그대로)
  const FALL_BASE = 0.3;       // 책 한 권이 쓰러지는 기본 시간
  const FALL_EXTRA = 0.25;     // 많이 기울어질수록 더해지는 시간
  const OVERLAP = 0.7;         // 앞 책이 이만큼(70%) 쓰러지면 다음 책 시작
  // 흰 책(3번째)까지는 위 속도 그대로, 그 뒤 책들은 더 빨리 연달아 쓰러짐
  const FAST_FROM = 3;         // 0부터 셈: 3 = 형광 책부터
  const FAST_DUR = 0.84;       // 쓰러지는 시간 배수 (작을수록 빠름)
  const FAST_OVERLAP = 0.64;   // 앞 책이 64% 쓰러지면 다음 책 시작
  const HOLD_END = 1.4;        // 다 쓰러진 뒤 멈춰 있는 시간
  const REWIND_SPEED = 2.6;    // 다시 일어날 때 속도 배수
  const HOLD_LOOP = 0.5;

  const rot = (p, piv, a) => {
    const dx = p[0] - piv[0], dy = p[1] - piv[1], c = Math.cos(a), s = Math.sin(a);
    return [piv[0] + dx * c - dy * s, piv[1] + dx * s + dy * c];
  };
  // 볼록 다각형 충돌 (SAT) — 살짝 닿는 건 허용
  function overlap(A, B) {
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], nx = q[1] - p[1], ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      const proj = Q => Q.map(v => (v[0] * nx + v[1] * ny) / len);
      const a = proj(A), b = proj(B);
      if (Math.max(...a) - Math.min(...b) < 0.6 || Math.max(...b) - Math.min(...a) < 0.6) return false;
    }
    return true;
  }

  async function build(src) {
    const img = new Image(); img.src = src; await img.decode();
    const k = img.naturalWidth / 1920;                       // 2배 해상도 이미지

    const books = SHELF.map((r, i) => {
      const fill = COLORS[i];
      if (r === 'lime') {
        const poly = LIME_POLY.map(p => p.slice());
        // 축: 가장 낮은 두 꼭짓점 중 왼쪽 것
        const low = [...poly].sort((a, b) => b[1] - a[1]).slice(0, 2).sort((a, b) => a[0] - b[0])[0];
        return { poly, pivot: low, fill };
      }
      const [x, y] = toCover(r[0], r[1]), w = r[2] / S;
      const poly = [[x, y], [x + w, y], [x + w, FLOOR], [x, FLOOR]];
      return { poly, pivot: [x, FLOOR], fill, outline: fill === '#ffffff' };
    });

    // 각 책이 멈출 각도: 바닥이나 앞서 쓰러진 책에 닿기 직전까지
    const settled = [];
    for (const b of books) {
      let a = 0;
      for (let t = 0; t > -Math.PI * 0.6; t -= 0.002) {
        const P = b.poly.map(p => rot(p, b.pivot, t));
        if (P.some(p => p[1] > FLOOR + 0.6)) break;
        if (settled.some(Q => overlap(P, Q))) break;
        a = t;
      }
      b.rest = a;
      settled.push(b.poly.map(p => rot(p, b.pivot, a)));
    }

    let s = HOLD_START;
    books.forEach((b, i) => {
      const fast = i >= FAST_FROM;
      b.dur = (FALL_BASE + FALL_EXTRA * Math.abs(b.rest) / (Math.PI / 2)) * (fast ? FAST_DUR : 1);
      b.bounce = fast ? 0.15 : 0.22;           // 닿은 뒤 튕기는 시간
      b.amp = fast ? 0.05 : 0.07;             // 튕기는 크기
      // 앞 책이 튕기는 중에 내려앉으면 겹쳐 보이므로, 앞 책이 다 멈춘 뒤에 닿도록
      const prev = books[i - 1];
      if (prev) s = Math.max(s, prev.start + prev.dur + prev.bounce - b.dur + 0.01);
      b.start = s;
      // 다음 책의 시작: 다음 책이 빠른 구간이면 더 일찍
      s += b.dur * (i + 1 >= FAST_FROM ? FAST_OVERLAP : OVERLAP);
    });
    const last = books[books.length - 1];
    const fallEnd = last.start + last.dur + last.bounce;
    const rewindStart = fallEnd + HOLD_END;
    const rewindEnd = rewindStart + (fallEnd - HOLD_START) / REWIND_SPEED;
    const total = rewindEnd + HOLD_LOOP;

    function angleAt(b, t) {                                 // t = "쓰러짐 시간"
      const u = (t - b.start) / b.dur;
      if (u <= 0) return 0;
      if (u < 1) return b.rest * u * u;                       // 중력처럼 점점 빨라짐
      const v = (t - b.start - b.dur) / b.bounce;             // 닿은 뒤 살짝 튕김
      if (v < 1) return b.rest * (1 - b.amp * Math.sin(Math.PI * v) * (1 - v));
      return b.rest;
    }
    // 반복 재생 시간 → 쓰러짐 시간
    function fallTimeAt(t) {
      t = ((t % total) + total) % total;
      if (t < fallEnd) return t;
      if (t < rewindStart) return fallEnd;
      if (t < rewindEnd) return fallEnd - (t - rewindStart) * REWIND_SPEED;
      return 0;
    }

    function drawFall(ctx, f, scale = 1) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1920, 1080);
      ctx.drawImage(img, 0, 0, img.naturalWidth, 400 * k, 0, 0, 1920, 400);   // PORTFOLIO 글자
      for (const b of books) {
        const P = b.poly.map(p => rot(p, b.pivot, angleAt(b, f)));
        ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        ctx.fillStyle = b.fill; ctx.fill();
        if (b.outline) { ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke(); }
      }
    }
    const draw = (ctx, t, scale) => drawFall(ctx, fallTimeAt(t), scale);
    // 확인용: 시간 f에서 각 책의 꼭짓점
    const polysAt = f => books.map(b => b.poly.map(p => rot(p, b.pivot, angleAt(b, f))));

    return { draw, drawFall, fallTimeAt, polysAt, overlap, total, fallEnd, upright: HOLD_START, books };
  }

  window.CoverFall = { build };
})();
