/* KEUANGANKU - logika aplikasi. File: app.js */
(() => {
  'use strict';

  /* ===================== Alat bantu ===================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titik = (n) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rp = (n) => (n < 0 ? '-' : '') + 'Rp ' + titik(n);
  const rpPendek = (n) => {
    const a = Math.abs(n);
    const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
    if (a >= 1e9) return f(a / 1e9) + ' M';
    if (a >= 1e6) return f(a / 1e6) + ' jt';
    if (a >= 1e3) return f(a / 1e3) + ' rb';
    return String(a);
  };

  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = BULAN.map((b) => b.slice(0, 3));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const tgl = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const hariIni = () => iso(new Date());
  const geser = (s, n) => { const d = tgl(s); d.setDate(d.getDate() + n); return iso(d); };
  const selisih = (a, b) => Math.round((tgl(b) - tgl(a)) / 864e5);
  const tglPendek = (s) => { const d = tgl(s); return d.getDate() + ' ' + BLN[d.getMonth()]; };
  const tglPanjang = (s) => { const d = tgl(s); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear(); };
  const minStr = (a, b) => (a < b ? a : b);

  const simpanan = {
    ambil(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    taruh(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penuh / diblokir */ } },
    buang(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  };
  const K_KONEKSI = 'keuanganku.koneksi', K_DATA = 'keuanganku.data', K_REK = 'keuanganku.rekening';

  /* Kategori: "🍜 Makan & Minum" -> ikon "🍜", nama "Makan & Minum" */
  const pecahKat = (k) => {
    const s = String(k || '');
    const i = s.indexOf(' ');
    if (i > 0 && /[^\u0000-ÿ]/.test(s.slice(0, i))) return { ikon: s.slice(0, i), nama: s.slice(i + 1) };
    return { ikon: '', nama: s };
  };
  const ikonTx = (t) => pecahKat(t.kategori).ikon || (t.jenis === 'pemasukan' ? '💰' : '🧾');

  /* ===================== Keadaan ===================== */
  const S = {
    tx: [], cfg: null, memuat: false, pernahMuat: false,
    view: 'beranda',
    periode: { tipe: 'bulan', dari: '', sampai: '' },
    riwayat: { q: '', jenis: 'semua', kat: '', dari: '', sampai: '', batas: 60 },
    tren: 'harian',
    form: null, detail: null
  };
  const grafik = {};

  /* ===================== Hubungan ke Apps Script ===================== */
  function galat(kode, pesan) { const e = new Error(pesan); e.kode = kode; return e; }

  async function api(action, isi, koneksi) {
    const k = koneksi || simpanan.ambil(K_KONEKSI);
    if (!k) throw galat('AUTH', 'Belum terhubung.');
    let res;
    try {
      res = await fetch(k.url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ pin: k.pin, action: action }, isi || {}))
      });
    } catch (e) {
      throw galat('NET', 'Tidak bisa terhubung. Periksa internetmu, lalu coba lagi.');
    }
    let j;
    try { j = await res.json(); } catch (e) {
      throw galat('BAD', 'Alamat Apps Script tidak merespons dengan benar. Periksa alamatnya dan pastikan aksesnya "Anyone".');
    }
    if (!j.ok) throw galat(j.code, j.error || 'Terjadi kesalahan.');
    return j.data;
  }

  /* ===================== Toast & dialog ===================== */
  let toastTimer;
  function toast(pesan, gagal) {
    const t = $('#toast');
    t.textContent = pesan;
    t.classList.toggle('err', !!gagal);
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), gagal ? 4500 : 2200);
  }

  function konfirmasi(judul, teks, labelYa) {
    return new Promise((selesai) => {
      const d = $('#dialog');
      $('#dlg-title').textContent = judul;
      $('#dlg-text').textContent = teks;
      $('#dlg-yes').textContent = labelYa;
      d.hidden = false;
      const tutup = (v) => { d.hidden = true; $('#dlg-yes').onclick = $('#dlg-no').onclick = d.onclick = null; selesai(v); };
      $('#dlg-yes').onclick = () => tutup(true);
      $('#dlg-no').onclick = () => tutup(false);
      d.onclick = (e) => { if (e.target === d) tutup(false); };
      $('#dlg-no').focus();
    });
  }

  /* ===================== Lembar bawah ===================== */
  let lembar = null;
  function bukaLembar(id) {
    if (lembar) { $('#' + lembar).classList.remove('on'); } else { history.pushState({ lembar: true }, ''); }
    lembar = id;
    $('#' + id).classList.add('on');
    $('#backdrop').classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function tutupLembar(dariTombolKembali) {
    if (!lembar) return;
    $('#' + lembar).classList.remove('on');
    $('#backdrop').classList.remove('on');
    document.body.style.overflow = '';
    lembar = null;
    if (!dariTombolKembali) history.back();
  }
  window.addEventListener('popstate', () => { if (!$('#dialog').hidden) $('#dlg-no').click(); tutupLembar(true); });

  /* ===================== Periode ===================== */
  function rentang() {
    const t = hariIni(), p = S.periode;
    if (p.tipe === 'hari') return [t, t];
    if (p.tipe === 'minggu') { const sen = geser(t, -((tgl(t).getDay() + 6) % 7)); return [sen, geser(sen, 6)]; }
    if (p.tipe === 'custom' && p.dari && p.sampai) return p.dari <= p.sampai ? [p.dari, p.sampai] : [p.sampai, p.dari];
    const d = tgl(t);
    return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  function labelPeriode() {
    const [a, b] = rentang(), p = S.periode;
    if (p.tipe === 'hari') return tglPanjang(a);
    if (p.tipe === 'bulan') { const d = tgl(a); return BULAN[d.getMonth()] + ' ' + d.getFullYear(); }
    return tglPendek(a) + ' – ' + tglPendek(b) + ' ' + tgl(b).getFullYear();
  }
  /* Periode pembanding: rentang sepanjang hari yang sudah berjalan, digeser satu periode ke belakang */
  function pembanding() {
    const [a, b] = rentang(), t = hariIni();
    const ujung = t < a ? b : minStr(t, b);
    const jalan = selisih(a, ujung);
    let pa;
    if (S.periode.tipe === 'bulan') { const d = tgl(a); pa = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
    else pa = geser(a, -(selisih(a, b) + 1));
    return { kini: [a, ujung], lalu: [pa, minStr(geser(pa, jalan), geser(a, -1))], hari: jalan + 1 };
  }
  const dalam = (a, b) => S.tx.filter((x) => x.tanggal >= a && x.tanggal <= b);
  const jumlah = (list, jenis) => list.reduce((s, x) => s + (x.jenis === jenis ? x.nominal : 0), 0);

  function htmlPeriode() {
    const p = S.periode;
    const c = (v, l) => '<button class="chip' + (p.tipe === v ? ' on' : '') + '" data-periode="' + v + '">' + l + '</button>';
    let h = '<div class="chips scroll">' + c('hari', 'Hari ini') + c('minggu', 'Minggu ini') + c('bulan', 'Bulan ini') + c('custom', 'Pilih tanggal') + '</div>';
    if (p.tipe === 'custom') {
      h += '<div class="custom-range"><label>Dari<input type="date" data-custom="dari" value="' + esc(p.dari) + '"></label>' +
        '<label>Sampai<input type="date" data-custom="sampai" value="' + esc(p.sampai) + '"></label></div>';
    }
    return h;
  }

  /* ===================== Baris transaksi ===================== */
  function urut(list) {
    return list.map((x, i) => [x, i]).sort((p, q) => (p[0].tanggal < q[0].tanggal ? 1 : p[0].tanggal > q[0].tanggal ? -1 : q[1] - p[1])).map((p) => p[0]);
  }
  function htmlTx(t, denganTanggal) {
    const k = pecahKat(t.kategori);
    const judul = t.sub || k.nama || 'Tanpa kategori';
    const kecil = t.detail || (t.sub ? k.nama : '');
    const masuk = t.jenis === 'pemasukan';
    const bawah = [denganTanggal ? tglPendek(t.tanggal) : '', t.rekening].filter(Boolean).join(', ');
    return '<button class="tx" data-tx="' + esc(t.id) + '" data-jenis="' + t.jenis + '">' +
      '<span class="tx-ico" aria-hidden="true">' + esc(ikonTx(t)) + '</span>' +
      '<span class="tx-main"><b>' + esc(judul) + '</b>' + (kecil ? '<small>' + esc(kecil) + '</small>' : '') + '</span>' +
      '<span class="tx-amt' + (masuk ? ' in' : '') + '">' + (masuk ? '+' : '-') + rp(t.nominal) +
      (bawah ? '<small>' + esc(bawah) + '</small>' : '') + '</span></button>';
  }
  const ikonKosong = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/></svg>';
  function htmlKosong(judul, teks, tombol) {
    return '<div class="empty"><div class="empty-ico">' + ikonKosong + '</div><h3>' + judul + '</h3><p>' + teks + '</p>' +
      (tombol ? '<button class="btn-primary" data-tambah>Tambah transaksi</button>' : '') + '</div>';
  }
  const htmlKerangka = () => '<div class="skel" style="height:172px;margin-top:16px"></div><div class="skel" style="height:68px;margin-top:26px"></div><div class="skel" style="height:68px;margin-top:10px"></div><div class="skel" style="height:68px;margin-top:10px"></div>';

  /* ===================== Beranda ===================== */
  function gambarBeranda() {
    const el = $('#view-beranda');
    if (!S.pernahMuat && S.memuat) { el.innerHTML = htmlPeriode() + htmlKerangka(); return; }
    const [a, b] = rentang();
    const list = dalam(a, b);
    const masuk = jumlah(list, 'pemasukan'), keluar = jumlah(list, 'pengeluaran');
    let h = htmlPeriode();
    h += '<div class="hero"><div class="hero-label">Saldo bersih, ' + esc(labelPeriode()) + '</div>' +
      '<div class="hero-num">' + rp(masuk - keluar) + '</div><div class="hero-row">' +
      '<div class="hero-stat"><span><i class="dot" style="color:#7ff0d0"></i>Pemasukan</span><b>' + rp(masuk) + '</b></div>' +
      '<div class="hero-stat"><span><i class="dot" style="color:#ffd1e6"></i>Pengeluaran</span><b>' + rp(keluar) + '</b></div></div></div>';

    if (!S.tx.length) {
      h += '<div style="margin-top:22px">' + htmlKosong('Belum ada transaksi', 'Catat transaksi pertamamu. Hanya butuh beberapa detik.', true) + '</div>';
      el.innerHTML = h; return;
    }

    /* Sekilas */
    const pb = pembanding();
    const kini = jumlah(dalam(pb.kini[0], pb.kini[1]), 'pengeluaran');
    const lalu = jumlah(dalam(pb.lalu[0], pb.lalu[1]), 'pengeluaran');
    const perKat = kelompokKategori(list);
    h += '<div class="section-head"><h2>Sekilas</h2></div><div class="insights">';
    if (perKat.length) {
      const top = perKat[0], k = pecahKat(top.kategori);
      h += kartuSekilas(k.ikon || '🧾', 'Pengeluaran terbesar', k.nama, rp(top.total) + ' atau ' + Math.round(top.total / keluar * 100) + '% dari pengeluaran');
    }
    h += kartuSekilas('📅', 'Rata-rata pengeluaran per hari', rp(kini / pb.hari), 'dihitung dari ' + pb.hari + ' hari berjalan');
    let teks, sub = tglPendek(pb.lalu[0]) + (pb.lalu[0] !== pb.lalu[1] ? ' – ' + tglPendek(pb.lalu[1]) : '') + ': ' + rp(lalu);
    if (!lalu && !kini) { teks = 'Belum ada pengeluaran'; }
    else if (!lalu) { teks = 'Periode sebelumnya tanpa pengeluaran'; }
    else {
      const persen = Math.round((kini - lalu) / lalu * 100);
      teks = persen === 0 ? 'Sama dengan periode sebelumnya' : (persen > 0 ? 'Naik ' : 'Turun ') + Math.abs(persen) + '% dari periode sebelumnya';
    }
    h += kartuSekilas(kini > lalu ? '↗' : kini < lalu ? '↘' : '→', 'Dibanding periode sebelumnya', teks, sub) + '</div>';

    /* Terbaru */
    h += '<div class="section-head"><h2>Transaksi terbaru</h2><button class="link" data-ke="riwayat">Lihat semua</button></div>';
    const baru = urut(list).slice(0, 5);
    h += baru.length ? '<div>' + baru.map((t) => htmlTx(t, true)).join('') + '</div>'
      : htmlKosong('Tidak ada transaksi di periode ini', 'Ganti periode di atas, atau catat transaksi baru.', true);
    el.innerHTML = h;
  }
  const kartuSekilas = (ikon, label, nilai, ket) => '<div class="insight"><div class="insight-ico" aria-hidden="true">' + esc(ikon) +
    '</div><div><small>' + esc(label) + '</small><b>' + esc(nilai) + '</b><em>' + esc(ket) + '</em></div></div>';

  function kelompokKategori(list) {
    const m = {};
    list.forEach((x) => { if (x.jenis === 'pengeluaran') m[x.kategori] = (m[x.kategori] || 0) + x.nominal; });
    return Object.keys(m).map((k) => ({ kategori: k, total: m[k] })).sort((p, q) => q.total - p.total);
  }

  /* ===================== Riwayat ===================== */
  function isiPilihanKategori() {
    const sel = $('#h-kat');
    const ada = {};
    S.tx.forEach((x) => { if (x.kategori) ada[x.kategori] = true; });
    if (S.cfg) Object.keys(S.cfg.kategoriPengeluaran).concat(S.cfg.kategoriPemasukan).forEach((k) => { ada[k] = true; });
    sel.innerHTML = '<option value="">Semua</option>' + Object.keys(ada).map((k) => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('');
    sel.value = S.riwayat.kat;
    if (sel.value !== S.riwayat.kat) S.riwayat.kat = '';
  }
  function gambarRiwayat() {
    const f = S.riwayat, q = f.q.trim().toLowerCase();
    $('#h-q').value = f.q; $('#h-from').value = f.dari; $('#h-to').value = f.sampai;
    $$('#h-jenis .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === f.jenis));
    isiPilihanKategori();
    const el = $('#h-list'), info = $('#h-info');
    if (!S.pernahMuat && S.memuat) { info.innerHTML = ''; el.innerHTML = htmlKerangka(); return; }
    const list = urut(S.tx.filter((x) =>
      (f.jenis === 'semua' || x.jenis === f.jenis) && (!f.kat || x.kategori === f.kat) &&
      (!f.dari || x.tanggal >= f.dari) && (!f.sampai || x.tanggal <= f.sampai) &&
      (!q || [x.kategori, x.sub, x.detail, x.rekening, String(x.nominal)].join(' ').toLowerCase().indexOf(q) >= 0)));
    const adaFilter = q || f.jenis !== 'semua' || f.kat || f.dari || f.sampai;
    info.innerHTML = '<span>' + list.length + ' transaksi</span>' + (adaFilter ? '<button class="link" data-reset>Hapus filter</button>' : '');
    if (!list.length) {
      el.innerHTML = adaFilter ? htmlKosong('Tidak ada yang cocok', 'Coba kata kunci lain atau longgarkan filternya.', false)
        : htmlKosong('Belum ada transaksi', 'Catat transaksi pertamamu. Hanya butuh beberapa detik.', true);
      return;
    }
    let h = '', hariSkrg = '';
    const tampil = list.slice(0, f.batas);
    const netoHari = {};
    list.forEach((x) => { netoHari[x.tanggal] = (netoHari[x.tanggal] || 0) + (x.jenis === 'pemasukan' ? x.nominal : -x.nominal); });
    tampil.forEach((t) => {
      if (t.tanggal !== hariSkrg) {
        hariSkrg = t.tanggal;
        h += '<div class="day">' + esc(t.tanggal === hariIni() ? 'Hari ini' : tglPanjang(t.tanggal)) + '<span>' + rp(netoHari[t.tanggal]) + '</span></div>';
      }
      h += htmlTx(t, false);
    });
    if (list.length > tampil.length) h += '<button class="btn-ghost" style="width:100%;margin-top:14px" data-lagi>Tampilkan lebih banyak</button>';
    el.innerHTML = h;
  }

  /* ===================== Grafik ===================== */
  const WARNA = { masuk: '#1baf7a', keluar: '#6250d6', garis: '#e7eaf4', teks: '#5b6079' };
  function opsiGrafik() {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#14162b', padding: 10, cornerRadius: 10, titleFont: { weight: '600' },
          callbacks: { label: (c) => (c.dataset.label ? c.dataset.label + ': ' : '') + rp(c.parsed.y) }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: WARNA.garis }, ticks: { color: WARNA.teks, maxRotation: 0, autoSkipPadding: 10 } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: WARNA.garis }, ticks: { color: WARNA.teks, maxTicksLimit: 5, callback: (v) => rpPendek(v) } }
      }
    };
  }
  const batang = (label, data, warna) => ({ label: label, data: data, backgroundColor: warna, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 26, categoryPercentage: .72, barPercentage: .86 });

  function gambarGrafik() {
    const el = $('#view-grafik');
    Object.keys(grafik).forEach((k) => { grafik[k].destroy(); delete grafik[k]; });
    if (!S.pernahMuat && S.memuat) { el.innerHTML = htmlPeriode() + htmlKerangka(); return; }
    if (!S.tx.length) { el.innerHTML = '<div style="margin-top:12px">' + htmlKosong('Grafik muncul setelah ada data', 'Catat beberapa transaksi dulu, lalu lihat polanya di sini.', true) + '</div>'; return; }
    const [a, b] = rentang();
    const list = dalam(a, b);
    const perKat = kelompokKategori(list);
    const total = perKat.reduce((s, x) => s + x.total, 0);

    let h = htmlPeriode();
    h += '<div class="card"><div class="card-head"><div><h2>Pengeluaran per kategori</h2><p>' + esc(labelPeriode()) + ', total ' + rp(total) + '</p></div></div>';
    if (!perKat.length) h += '<p class="muted-note">Tidak ada pengeluaran di periode ini.</p>';
    else {
      const maks = perKat[0].total;
      h += perKat.map((x) => {
        const k = pecahKat(x.kategori);
        return '<button class="catbar" data-katbar="' + esc(x.kategori) + '"><div class="catbar-top"><span>' + esc((k.ikon ? k.ikon + ' ' : '') + k.nama) +
          '</span><span>' + rp(x.total) + '<small>' + Math.round(x.total / total * 100) + '%</small></span></div>' +
          '<div class="catbar-track"><div class="catbar-fill" style="width:' + (x.total / maks * 100).toFixed(1) + '%"></div></div></button>';
      }).join('');
    }
    h += '</div>';

    /* Tren */
    const tren = dataTren(a, b);
    h += '<div class="card"><div class="card-head"><div><h2>Tren pengeluaran</h2><p>' + esc(tren.ket) + '</p></div>' +
      '<div class="mini-seg"><button data-tren="harian"' + (S.tren === 'harian' ? ' class="on"' : '') + '>Harian</button>' +
      '<button data-tren="bulanan"' + (S.tren === 'bulanan' ? ' class="on"' : '') + '>Bulanan</button></div></div>' +
      '<div class="chart-box"><canvas id="c-tren" role="img" aria-label="Grafik batang tren pengeluaran"></canvas></div></div>';

    /* Pemasukan vs pengeluaran */
    const bln = bulanTerakhir(6);
    h += '<div class="card"><div class="card-head"><div><h2>Pemasukan dan pengeluaran</h2><p>6 bulan terakhir</p></div></div>' +
      '<div class="legend"><span><i style="background:' + WARNA.masuk + '"></i>Pemasukan</span><span><i style="background:' + WARNA.keluar + '"></i>Pengeluaran</span></div>' +
      '<div class="chart-box"><canvas id="c-banding" role="img" aria-label="Grafik batang pemasukan dan pengeluaran per bulan"></canvas></div></div>';
    el.innerHTML = h;

    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11.5;
    const oT = opsiGrafik();
    oT.plugins.tooltip.callbacks.title = (it) => tren.judul[it[0].dataIndex];
    grafik.tren = new Chart($('#c-tren'), { type: 'bar', data: { labels: tren.label, datasets: [batang('', tren.nilai, WARNA.keluar)] }, options: oT });
    grafik.banding = new Chart($('#c-banding'), {
      type: 'bar',
      data: {
        labels: bln.map((m) => BLN[m.b] + (m.b === 0 ? ' ' + String(m.t).slice(2) : '')),
        datasets: [batang('Pemasukan', bln.map((m) => jumlah(dalam(m.dari, m.sampai), 'pemasukan')), WARNA.masuk),
          batang('Pengeluaran', bln.map((m) => jumlah(dalam(m.dari, m.sampai), 'pengeluaran')), WARNA.keluar)]
      },
      options: opsiGrafik()
    });
  }
  function bulanTerakhir(n) {
    const d = new Date(), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({ t: x.getFullYear(), b: x.getMonth(), dari: iso(x), sampai: iso(new Date(x.getFullYear(), x.getMonth() + 1, 0)) });
    }
    return out;
  }
  function dataTren(a, b) {
    if (S.tren === 'bulanan') {
      const bln = bulanTerakhir(12);
      return {
        ket: '12 bulan terakhir', label: bln.map((m) => BLN[m.b]), judul: bln.map((m) => BULAN[m.b] + ' ' + m.t),
        nilai: bln.map((m) => jumlah(dalam(m.dari, m.sampai), 'pengeluaran'))
      };
    }
    let dari = a, sampai = b;
    if (selisih(a, b) < 6) { sampai = minStr(b, hariIni()) < a ? b : minStr(b, hariIni()); dari = geser(sampai, -6); }   // minimal 7 hari
    if (selisih(dari, sampai) > 61) dari = geser(sampai, -61);                                                        // paling banyak 62 hari
    const per = {};
    dalam(dari, sampai).forEach((x) => { if (x.jenis === 'pengeluaran') per[x.tanggal] = (per[x.tanggal] || 0) + x.nominal; });
    const label = [], judul = [], nilai = [];
    for (let h = dari; h <= sampai; h = geser(h, 1)) { label.push(String(tgl(h).getDate())); judul.push(tglPanjang(h)); nilai.push(per[h] || 0); }
    return { ket: tglPendek(dari) + ' – ' + tglPendek(sampai), label: label, judul: judul, nilai: nilai };
  }

  /* ===================== Pengaturan ===================== */
  function gambarAkun() {
    const k = simpanan.ambil(K_KONEKSI) || {};
    const d = simpanan.ambil(K_DATA);
    const kapan = d && d.kapan ? new Date(d.kapan) : null;
    $('#view-akun').innerHTML = '<div class="set-list">' +
      '<div class="set-item"><div><b>Terhubung ke spreadsheet</b><small>' + S.tx.length + ' transaksi terbaca' +
      (kapan ? ', diperbarui ' + pad(kapan.getHours()) + '.' + pad(kapan.getMinutes()) + ' ' + tglPendek(iso(kapan)) : '') + '</small></div></div>' +
      '<button class="set-item" data-aksi="muat"><div><b>Muat ulang data</b><small>Ambil data terbaru dari spreadsheet</small></div></button>' +
      '<button class="set-item danger" data-aksi="keluar"><div><b>Putuskan dari HP ini</b><small>Hapus alamat, PIN, dan salinan data di HP ini. Spreadsheet tidak berubah.</small></div></button>' +
      '</div><p class="about">Kategori dan rekening diatur di Code.gs pada spreadsheet.<br>Alamat terhubung: …' + esc(String(k.url || '').slice(-18)) + '</p>';
  }

  /* ===================== Navigasi & gambar ulang ===================== */
  const JUDUL = { beranda: 'Beranda', riwayat: 'Riwayat', grafik: 'Grafik', akun: 'Pengaturan' };
  function gambar() {
    $('#top-title').textContent = JUDUL[S.view];
    $('#top-sub').textContent = S.view === 'beranda' ? tglPanjang(hariIni()) : '';
    if (S.view === 'beranda') gambarBeranda();
    else if (S.view === 'riwayat') gambarRiwayat();
    else if (S.view === 'grafik') gambarGrafik();
    else gambarAkun();
  }
  function ke(view) {
    S.view = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    $$('.nav').forEach((n) => n.classList.toggle('on', n.dataset.view === view));
    window.scrollTo(0, 0);
    gambar();
  }

  /* ===================== Muat data ===================== */
  function simpanData() { simpanan.taruh(K_DATA, { tx: S.tx, cfg: S.cfg, kapan: Date.now() }); }
  async function muat(diam) {
    if (S.memuat) return;
    S.memuat = true;
    $('#loadbar').hidden = false; $('#btn-refresh').classList.add('spin');
    if (!S.pernahMuat) gambar();
    try {
      const d = await api('init');
      S.tx = d.transaksi || [];
      S.cfg = { rekening: d.rekening, kategoriPemasukan: d.kategoriPemasukan, kategoriPengeluaran: d.kategoriPengeluaran };
      S.pernahMuat = true;
      simpanData();
      if (!diam) toast('Data diperbarui');
    } catch (e) {
      if (e.kode === 'AUTH' || e.kode === 'NO_PIN') { S.memuat = false; selesaiMuat(); keluar(e.message); return; }
      S.pernahMuat = true;
      toast(e.message, true);
    }
    S.memuat = false;
    selesaiMuat();
    gambar();
  }
  function selesaiMuat() { $('#loadbar').hidden = true; $('#btn-refresh').classList.remove('spin'); }

  /* ===================== Form transaksi ===================== */
  function bukaForm(tx) {
    if (!S.cfg) { toast('Data belum siap. Tunggu sebentar, lalu coba lagi.', true); return; }
    const rekAkhir = simpanan.ambil(K_REK);
    S.form = tx
      ? { edit: true, asal: tx, jenis: tx.jenis, kategori: tx.kategori, sub: tx.sub || '', rekening: tx.rekening, tanggal: tx.tanggal }
      : { edit: false, jenis: 'pengeluaran', kategori: '', sub: '', rekening: S.cfg.rekening.indexOf(rekAkhir) >= 0 ? rekAkhir : (S.cfg.rekening[0] || ''), tanggal: hariIni() };
    $('#form-title').textContent = tx ? 'Edit transaksi' : 'Tambah transaksi';
    $('#f-nominal').value = tx ? titik(tx.nominal) : '';
    $('#f-detail').value = tx ? tx.detail || '' : '';
    $('#f-jenis').classList.toggle('locked', !!tx);
    $('#e-nominal').hidden = true; $('#e-kat').hidden = true; $('.amount').classList.remove('err');
    setSibuk(false);
    gambarForm();
    bukaLembar('sheet-form');
    $('#sheet-form').scrollTop = 0;
    if (!tx) setTimeout(() => $('#f-nominal').focus(), 60);
  }
  function gambarForm() {
    const f = S.form, keluarJ = f.jenis === 'pengeluaran';
    $$('#f-jenis button').forEach((b) => b.classList.toggle('on', b.dataset.jenis === f.jenis));
    $('#l-rek').textContent = keluarJ ? 'Rekening' : 'Jenis dana';
    let daftar = keluarJ ? Object.keys(S.cfg.kategoriPengeluaran) : S.cfg.kategoriPemasukan.slice();
    if (f.kategori && daftar.indexOf(f.kategori) < 0) daftar.push(f.kategori);       // kategori lama tetap bisa dipilih
    const g = $('#f-kat');
    g.classList.toggle('simple', !keluarJ);
    g.innerHTML = daftar.map((k) => {
      const p = pecahKat(k);
      return '<button type="button" class="kat' + (k === f.kategori ? ' on' : '') + '" data-kat="' + esc(k) + '" aria-pressed="' + (k === f.kategori) + '">' +
        (p.ikon ? '<i aria-hidden="true">' + esc(p.ikon) + '</i>' : '') + '<span>' + esc(p.nama) + '</span></button>';
    }).join('');
    const subs = keluarJ && f.kategori ? (S.cfg.kategoriPengeluaran[f.kategori] || []).slice() : [];
    if (f.sub && subs.indexOf(f.sub) < 0) subs.push(f.sub);
    $('#w-sub').hidden = !subs.length;
    $('#f-sub').innerHTML = subs.map((s) => '<button type="button" class="chip' + (s === f.sub ? ' on' : '') + '" data-sub="' + esc(s) + '">' + esc(s) + '</button>').join('');
    const rek = S.cfg.rekening.slice();
    if (f.rekening && rek.indexOf(f.rekening) < 0) rek.push(f.rekening);
    $('#f-rek').innerHTML = rek.map((r) => '<button type="button" class="chip' + (r === f.rekening ? ' on' : '') + '" data-rek="' + esc(r) + '">' + esc(r) + '</button>').join('');
    $('#f-tgl').value = f.tanggal;
    $$('[data-tgl]').forEach((c) => c.classList.toggle('on', geser(hariIni(), Number(c.dataset.tgl)) === f.tanggal));
  }
  function setSibuk(v) {
    const b = $('#f-simpan');
    b.disabled = v; b.classList.toggle('busy', v);
    b.textContent = v ? 'Menyimpan…' : 'Simpan';
  }
  async function kirimForm(ev) {
    ev.preventDefault();
    const f = S.form;
    if (!f || $('#f-simpan').disabled) return;
    const nominal = Number($('#f-nominal').value.replace(/\D/g, ''));
    const salahNom = !(nominal > 0), salahKat = !f.kategori;
    $('#e-nominal').hidden = !salahNom; $('.amount').classList.toggle('err', salahNom);
    $('#e-kat').hidden = !salahKat;
    if (salahNom) { $('#f-nominal').focus(); return; }
    if (salahKat) { $('#f-kat').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!f.tanggal) { toast('Pilih tanggal dulu.', true); return; }
    const tx = { id: f.edit ? f.asal.id : '', jenis: f.jenis, nominal: nominal, tanggal: f.tanggal, kategori: f.kategori,
      sub: f.jenis === 'pengeluaran' ? f.sub : '', detail: $('#f-detail').value.trim(), rekening: f.rekening };
    setSibuk(true);
    try {
      if (f.edit) {
        const d = await api('update', { tx: tx, asal: { tanggal: f.asal.tanggal, nominal: f.asal.nominal } });
        const i = S.tx.findIndex((x) => x.id === f.asal.id && x.jenis === f.jenis);
        if (i >= 0) S.tx[i] = d.tx;
      } else {
        const d = await api('add', { tx: tx });
        S.tx.push(d.tx);
        simpanan.taruh(K_REK, f.rekening);
      }
      simpanData();
      tutupLembar();
      gambar();
      toast(f.edit ? 'Perubahan tersimpan' : 'Tersimpan ke sheet ' + (f.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'));
    } catch (e) {
      setSibuk(false);
      toast('Gagal menyimpan. ' + e.message, true);
      if (e.kode === 'AUTH') { tutupLembar(); keluar(e.message); }
    }
  }

  /* ===================== Detail, edit, hapus ===================== */
  function bukaDetail(id, jenis) {
    const t = S.tx.find((x) => x.id === id && x.jenis === jenis);
    if (!t) return;
    S.detail = t;
    const k = pecahKat(t.kategori), masuk = t.jenis === 'pemasukan';
    const baris = (l, v) => (v ? '<div><span>' + l + '</span><b>' + esc(v) + '</b></div>' : '');
    $('#detail-body').innerHTML = '<div class="detail-amt' + (masuk ? ' in' : '') + '">' + (masuk ? '+' : '-') + rp(t.nominal) + '</div>' +
      '<div class="detail-rows">' + baris('Jenis', masuk ? 'Pemasukan' : 'Pengeluaran') + baris('Tanggal', tglPanjang(t.tanggal)) +
      baris('Kategori', (k.ikon ? k.ikon + ' ' : '') + k.nama) + baris('Subkategori', t.sub) +
      baris(masuk ? 'Jenis dana' : 'Rekening', t.rekening) + baris('Catatan', t.detail) + '</div>';
    bukaLembar('sheet-detail');
  }
  async function hapusDetail() {
    const t = S.detail;
    if (!t) return;
    const ya = await konfirmasi('Hapus transaksi ini?', (t.sub || pecahKat(t.kategori).nama) + ', ' + rp(t.nominal) + ' pada ' + tglPendek(t.tanggal) +
      '. Barisnya juga dihapus dari spreadsheet dan tidak bisa dikembalikan dari aplikasi.', 'Hapus');
    if (!ya) return;
    const b = $('#d-hapus');
    b.disabled = true; b.textContent = 'Menghapus…';
    try {
      await api('delete', { tx: { id: t.id, jenis: t.jenis, tanggal: t.tanggal, nominal: t.nominal } });
      S.tx = S.tx.filter((x) => !(x.id === t.id && x.jenis === t.jenis));
      simpanData();
      tutupLembar();
      gambar();
      toast('Transaksi dihapus');
    } catch (e) {
      toast('Gagal menghapus. ' + e.message, true);
    }
    b.disabled = false; b.textContent = 'Hapus';
  }

  /* ===================== Hubungkan / putuskan ===================== */
  function tampilLogin(pesan) {
    $('#app').hidden = true; $('#login').hidden = false;
    const e = $('#l-err');
    e.hidden = !pesan; e.textContent = pesan || '';
  }
  function keluar(pesan) {
    simpanan.buang(K_KONEKSI); simpanan.buang(K_DATA);
    S.tx = []; S.cfg = null; S.pernahMuat = false;
    tampilLogin(pesan);
  }
  async function hubungkan(ev) {
    ev.preventDefault();
    const url = $('#l-url').value.trim(), pin = $('#l-pin').value;
    const e = $('#l-err'), b = $('#l-btn');
    const salah = (m) => { e.textContent = m; e.hidden = false; };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return salah('Alamat harus diawali https://script.google.com/macros/s/ dan diakhiri /exec.');
    if (!pin) return salah('Isi PIN dulu.');
    e.hidden = true; b.disabled = true; b.classList.add('busy'); b.textContent = 'Menghubungkan…';
    try {
      const d = await api('init', null, { url: url, pin: pin });
      simpanan.taruh(K_KONEKSI, { url: url, pin: pin });
      S.tx = d.transaksi || [];
      S.cfg = { rekening: d.rekening, kategoriPemasukan: d.kategoriPemasukan, kategoriPengeluaran: d.kategoriPengeluaran };
      S.pernahMuat = true;
      simpanData();
      $('#l-pin').value = '';
      mulaiApp();
      toast('Terhubung');
    } catch (x) { salah(x.message); }
    b.disabled = false; b.classList.remove('busy'); b.textContent = 'Hubungkan';
  }
  function mulaiApp() { $('#login').hidden = true; $('#app').hidden = false; ke('beranda'); }

  /* ===================== Peristiwa ===================== */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, [data-close]');
    if (!t) return;
    const d = t.dataset;
    if (t.id === 'fab' || 'tambah' in d) return bukaForm(null);
    if (d.view) return ke(d.view);
    if (d.ke) return ke(d.ke);
    if ('close' in d) return tutupLembar();
    if (d.periode) {
      if (d.periode === 'custom' && !S.periode.dari) { const [a, b] = rentang(); S.periode.dari = a; S.periode.sampai = minStr(b, hariIni()) < a ? b : minStr(b, hariIni()); }
      S.periode.tipe = d.periode; return gambar();
    }
    if (d.tx) return bukaDetail(d.tx, d.jenis);
    if (d.tren) { S.tren = d.tren; return gambarGrafik(); }
    if (d.katbar) {
      const [a, b] = rentang();
      Object.assign(S.riwayat, { q: '', jenis: 'pengeluaran', kat: d.katbar, dari: a, sampai: b, batas: 60 });
      return ke('riwayat');
    }
    if ('reset' in d) { Object.assign(S.riwayat, { q: '', jenis: 'semua', kat: '', dari: '', sampai: '', batas: 60 }); return gambarRiwayat(); }
    if ('lagi' in d) { S.riwayat.batas += 60; return gambarRiwayat(); }
    if (d.v && t.closest('#h-jenis')) { S.riwayat.jenis = d.v; return gambarRiwayat(); }
    if (d.aksi === 'muat') return muat();
    if (d.aksi === 'keluar') {
      return konfirmasi('Putuskan dari HP ini?', 'Kamu perlu memasukkan alamat dan PIN lagi untuk memakai aplikasi. Data di spreadsheet tetap aman.', 'Putuskan')
        .then((ya) => { if (ya) keluar(''); });
    }
    /* form */
    const f = S.form;
    if (f && t.closest('#sheet-form')) {
      if (d.jenis && t.closest('#f-jenis')) { if (f.edit || f.jenis === d.jenis) return; f.jenis = d.jenis; f.kategori = ''; f.sub = ''; return gambarForm(); }
      if (d.kat) { if (f.kategori !== d.kat) f.sub = ''; f.kategori = d.kat; $('#e-kat').hidden = true; return gambarForm(); }
      if (d.sub) { f.sub = f.sub === d.sub ? '' : d.sub; return gambarForm(); }
      if (d.rek) { f.rekening = d.rek; return gambarForm(); }
      if (d.tgl) { f.tanggal = geser(hariIni(), Number(d.tgl)); return gambarForm(); }
    }
  });
  $('#backdrop').addEventListener('click', () => tutupLembar());
  $('#btn-refresh').addEventListener('click', () => muat());
  $('#form').addEventListener('submit', kirimForm);
  $('#login-form').addEventListener('submit', hubungkan);
  $('#d-edit').addEventListener('click', () => { if (S.detail) bukaForm(S.detail); });
  $('#d-hapus').addEventListener('click', hapusDetail);
  $('#f-nominal').addEventListener('input', (e) => {
    const angka = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    e.target.value = angka ? titik(Number(angka)) : '';
    if (angka) { $('#e-nominal').hidden = true; $('.amount').classList.remove('err'); }
  });
  $('#f-tgl').addEventListener('change', (e) => { if (S.form && e.target.value) { S.form.tanggal = e.target.value; gambarForm(); } });
  $('#h-q').addEventListener('input', (e) => { S.riwayat.q = e.target.value; S.riwayat.batas = 60; gambarRiwayat(); });
  $('#h-kat').addEventListener('change', (e) => { S.riwayat.kat = e.target.value; gambarRiwayat(); });
  $('#h-from').addEventListener('change', (e) => { S.riwayat.dari = e.target.value; gambarRiwayat(); });
  $('#h-to').addEventListener('change', (e) => { S.riwayat.sampai = e.target.value; gambarRiwayat(); });
  document.addEventListener('change', (e) => {
    const c = e.target.dataset && e.target.dataset.custom;
    if (c && e.target.value) { S.periode[c] = e.target.value; gambar(); }
  });
  document.addEventListener('visibilitychange', () => {
    const d = simpanan.ambil(K_DATA);
    if (!document.hidden && simpanan.ambil(K_KONEKSI) && !lembar && (!d || Date.now() - d.kapan > 5 * 60e3)) muat(true);
  });

  /* ===================== Mulai ===================== */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* tetap jalan tanpa SW */ });
  }
  if (simpanan.ambil(K_KONEKSI)) {
    const d = simpanan.ambil(K_DATA);
    if (d && d.cfg) { S.tx = d.tx || []; S.cfg = d.cfg; S.pernahMuat = true; }
    mulaiApp();
    muat(true);
  } else {
    tampilLogin('');
  }
})();
