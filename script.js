// ==========================================================
// 0. AUTORISASI & KONFIGURASI FIREBASE 
// ==========================================================

const firebaseConfig = {
    apiKey: "AIzaSyAV5A-AB2PYmPf7nvAKRu2b9d73Usd0HO0",
    authDomain: "merentas-809e2.firebaseapp.com",
    projectId: "merentas-809e2",
    storageBucket: "merentas-809e2.firebasestorage.app",
    messagingSenderId: "749985566541",
    appId: "1:749985566541:web:2b6153c30cf310db1eb104",
    measurementId: "G-FWCPVKDC23"
};

const ADMIN_UID = "op36sIcDvOfsJZnYVpxUuGgVg5B2"; // UID Admin

// INISIALISASI FIREBASE
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserRole = null; // 'admin' atau 'user'
let currentUserID = null;

function isAdmin() {
    return currentUserID === ADMIN_UID;
}

// --- HELPER KESELAMATAN (XSS PREVENTION) ---
// Membersihkan teks dari aksara khas HTML untuk elak kod hasad
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// ==========================================================
// 1. MODEL DATA (Classes: Peserta dan Kejohanan)
// ==========================================================

class Peserta {
    constructor(noBadan, namaPenuh, jantina, kategoriUmur, sekolahKelas, docId = null) {
        this.docId = docId;
        this.noBadan = noBadan;
        this.namaPenuh = namaPenuh;
        this.jantina = jantina;
        this.kategoriUmur = kategoriUmur.toUpperCase().trim();
        this.sekolahKelas = sekolahKelas;
        this.kedudukan = 0; // Kedudukan Overall
        this.masaLarian = null; // Masa (minit)
    }

    static fromJSON(data, docId) {
        const p = new Peserta(data.noBadan, data.namaPenuh, data.jantina, data.kategoriUmur, data.sekolahKelas, docId);
        p.kedudukan = data.kedudukan || 0;
        p.masaLarian = data.masaLarian !== undefined ? data.masaLarian : null;
        return p;
    }
}

class Kejohanan {
    constructor() {
        this.senaraiPeserta = [];
    }

    // --- A. PENGURUSAN PENYIMPANAN (FIRESTORE) ---

    async loadDataFromFirestore() {
        console.log('⏳ Memuatkan data peserta dari Firestore...');
        try {
            const snapshot = await db.collection('peserta').get();
            this.senaraiPeserta = snapshot.docs.map(doc => Peserta.fromJSON(doc.data(), doc.id));
            console.log(`✅ ${this.senaraiPeserta.length} peserta dimuatkan.`);
            paparSemuaPeserta();
        } catch (error) {
            console.error('❌ Ralat memuatkan data:', error);
            alert('Ralat memuatkan data. Sila semak konsol.');
        }
    }
    
    async updatePeserta(noBadan, updateData) {
        if (!isAdmin()) {
            console.warn('❌ Akses Ditolak.');
            return false;
        }
        
        const pesertaToUpdate = this.senaraiPeserta.find(p => p.noBadan.trim() === noBadan.trim());
        
        if (!pesertaToUpdate || !pesertaToUpdate.docId) {
            console.error(`❌ Peserta ${noBadan} tidak ditemui.`);
            return false;
        }

        try {
            const firestoreUpdateData = {};
            for (const key in updateData) {
                firestoreUpdateData[key] = updateData[key] === '' ? null : updateData[key];
            }
            
            await db.collection('peserta').doc(pesertaToUpdate.docId).update(firestoreUpdateData);
            
            // Kemas kini model tempatan
            Object.assign(pesertaToUpdate, updateData);
            
            // Jika kedudukan/masa berubah, kemas kini analisis di latar belakang sahaja
            if (updateData.kedudukan !== undefined || updateData.masaLarian !== undefined) {
                 // Kita tidak panggil analisisIndividu() di sini untuk elak re-render berat
            }
            
            return true;
        } catch (error) {
            console.error('❌ Ralat update Firestore:', error);
            return false;
        }
    }

    // --- B. PENDAFTARAN & DATA ---

    async daftarPeserta(p) {
        if (!isAdmin()) return false;
        
        const noBadanTrimmed = p.noBadan.trim();
        const exists = this.senaraiPeserta.some(peserta => peserta.noBadan.trim() === noBadanTrimmed);
        
        if (exists) return false;
        
        try {
            await db.collection('peserta').doc(noBadanTrimmed).set({
                noBadan: p.noBadan,
                namaPenuh: p.namaPenuh,
                jantina: p.jantina,
                kategoriUmur: p.kategoriUmur,
                sekolahKelas: p.sekolahKelas,
                kedudukan: 0,
                masaLarian: null
            });

            p.docId = noBadanTrimmed;
            this.senaraiPeserta.push(p);
            return true;
        } catch (error) {
            console.error('❌ Ralat daftar peserta:', error);
            return false;
        }
    }
    
    async setKedudukan(noBadan, kedudukan) {
        const kedudukanInt = (kedudukan === '' || isNaN(kedudukan)) ? 0 : Math.max(0, parseInt(kedudukan));
        const updateData = { kedudukan: kedudukanInt };
        if (kedudukanInt === 0) updateData.masaLarian = null;
        return this.updatePeserta(noBadan, updateData);
    }
    
    async setMasaLarian(noBadan, masaLarian) {
        const masaFloat = (masaLarian === '' || isNaN(masaLarian)) ? null : parseFloat(masaLarian);
        return this.updatePeserta(noBadan, { masaLarian: masaFloat });
    }
    
    async padamPesertaIndividu(noBadan) {
        if (!isAdmin()) return false;
        const noBadanTrimmed = noBadan.trim();
        const peserta = this.senaraiPeserta.find(p => p.noBadan.trim() === noBadanTrimmed);
        
        if (!peserta || !peserta.docId) return false;
        
        try {
            await db.collection('peserta').doc(peserta.docId).delete();
            this.senaraiPeserta = this.senaraiPeserta.filter(p => p.noBadan.trim() !== noBadanTrimmed);
            return true;
        } catch (error) {
            console.error('❌ Ralat padam peserta:', error);
            return false;
        }
    }

    async resetSemuaData() {
        if (!isAdmin()) return false;
        try {
            const batch = db.batch();
            const snapshot = await db.collection('peserta').get();
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            this.senaraiPeserta = [];
            return true;
        } catch (error) {
            console.error('❌ Ralat reset data:', error);
            return false;
        }
    }

    // --- C. LOGIK PEMARKAHAN (Helper) --- 

    dapatkanPemenangTersusunMengikutKategori() {
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        const petaKategori = pesertaSelesai.reduce((acc, peserta) => {
            const kategori = peserta.kategoriUmur;
            if (!acc[kategori]) acc[kategori] = [];
            acc[kategori].push(peserta);
            return acc;
        }, {});
        
        for (const kategori in petaKategori) {
            petaKategori[kategori].sort((a, b) => a.kedudukan - b.kedudukan);
        }
        return petaKategori;
    }

    dapatkanPemenangTersusunMengikutKumpulan() {
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        const petaKumpulan = pesertaSelesai.reduce((acc, peserta) => {
            const kunciKumpulan = `${peserta.kategoriUmur}|${peserta.sekolahKelas}`; 
            if (!acc[kunciKumpulan]) acc[kunciKumpulan] = [];
            acc[kunciKumpulan].push(peserta);
            return acc;
        }, {});
        
        for (const kunci in petaKumpulan) {
            petaKumpulan[kunci].sort((a, b) => a.kedudukan - b.kedudukan);
        }
        return petaKumpulan;
    }

    // --- D. PAPARAN DAN ANALISIS KEPUTUSAN --- 
    
    paparSemuaPesertaDalamJadual() {
        if (this.senaraiPeserta.length === 0) return '<p>Tiada peserta didaftarkan.</p>';

        let htmlOutput = '<table>';
        htmlOutput += '<tr><th>NO. BADAN</th><th>NAMA PENUH</th><th>JANTINA</th><th>KATEGORI</th><th>PASUKAN</th><th>KEDUDUKAN</th><th>MASA LARIAN (minit)</th></tr>';

        const senaraiTersusun = [...this.senaraiPeserta].sort((a, b) => a.noBadan.localeCompare(b.noBadan)); 

        senaraiTersusun.forEach(p => {
            const kedudukanDisplay = p.kedudukan > 0 ? p.kedudukan : '';
            const masaDisplay = p.masaLarian !== null ? p.masaLarian.toFixed(2) : '';

            const isEditable = isAdmin() ? `contenteditable="true"` : '';
            const kedudukanCellClass = isAdmin() ? `class="edit-cell kedudukan-cell"` : '';
            const masaCellClass = isAdmin() ? `class="edit-cell masa-cell"` : '';

            // MENGGUNAKAN escapeHtml UNTUK KESELAMATAN
            htmlOutput += `<tr>
                <td data-nobadan="${escapeHtml(p.noBadan)}">${escapeHtml(p.noBadan)}</td>
                <td>${escapeHtml(p.namaPenuh)}</td>
                <td>${escapeHtml(p.jantina)}</td>
                <td>${escapeHtml(p.kategoriUmur)}</td>
                <td>${escapeHtml(p.sekolahKelas)}</td>
                <td ${isEditable} ${kedudukanCellClass} data-nobadan="${escapeHtml(p.noBadan)}" data-field="kedudukan">${kedudukanDisplay}</td>
                <td ${isEditable} ${masaCellClass} data-nobadan="${escapeHtml(p.noBadan)}" data-field="masaLarian">${masaDisplay}</td>
            </tr>`;
        });
        
        htmlOutput += '</table>';
        htmlOutput += `<p>Jumlah Keseluruhan: <strong>${this.senaraiPeserta.length}</strong></p>`;
        return htmlOutput;
    }
    
    analisisPemenangIndividuKategori() {
        const pemenangKategori = this.dapatkanPemenangTersusunMengikutKategori();
        let htmlOutput = '';

        if (Object.keys(pemenangKategori).length === 0) return '<p>Tiada keputusan direkodkan.</p>';

        for (const kategori in pemenangKategori) {
            const senarai = pemenangKategori[kategori];
            
            // Logik Masa
            let masaRank10 = null;
            const rank10Peserta = senarai.find((p, index) => index === 9 && p.masaLarian !== null);
            if (rank10Peserta) masaRank10 = rank10Peserta.masaLarian;

            htmlOutput += `<h4>== KATEGORI: ${escapeHtml(kategori)} ==</h4>`;
            
            if (masaRank10 === null && senarai.length >= 11) {
                htmlOutput += `<p style="color:red; font-size: 0.9em;">⚠️ Sila masukkan masa untuk Rank 10 bagi mengaktifkan pengiraan automatik Rank 11+.</p>`;
            }
            
            htmlOutput += '<table>';
            htmlOutput += '<tr><th>RANK</th><th>OVERALL</th><th>MASA</th><th>NAMA</th><th>SEKOLAH</th><th>NO. BADAN</th></tr>'; 
            
            for (let i = 0; i < senarai.length; i++) {
                const p = senarai[i];
                const rankKategori = i + 1;
                
                let masaDisplay = '';
                let masaActual = p.masaLarian;

                if (rankKategori >= 11 && masaRank10 !== null) {
                    masaActual = masaRank10 + ((rankKategori - 10) * 0.03);
                }
                
                if (masaActual !== null) masaDisplay = masaActual.toFixed(2);
                else if (p.kedudukan > 0) masaDisplay = '-';

                htmlOutput += `<tr>
                    <td>${rankKategori}</td>
                    <td>${p.kedudukan}</td>
                    <td>${masaDisplay}</td>
                    <td>${escapeHtml(p.namaPenuh)}</td>
                    <td>${escapeHtml(p.sekolahKelas)}</td>
                    <td>${escapeHtml(p.noBadan)}</td>
                </tr>`;
            }
            htmlOutput += '</table>';
        }
        return htmlOutput;
    }
    
    analisisPemenangKumpulan() {
        const petaKumpulan = this.dapatkanPemenangTersusunMengikutKumpulan();
        const keputusanMengikutKategori = {};

        for (const kunci in petaKumpulan) {
            const senaraiKumpulan = petaKumpulan[kunci];
            const [kategori, sekolahKelas] = kunci.split('|');
            const bilanganPesertaLayak = senaraiKumpulan.length;
            
            if (bilanganPesertaLayak >= 4) {
                const peserta4Terbaik = senaraiKumpulan.slice(0, 4);
                const markahKumpulan = peserta4Terbaik.reduce((sum, p) => sum + p.kedudukan, 0); 
                
                let tieBreaker = null;
                if (bilanganPesertaLayak >= 5) tieBreaker = senaraiKumpulan[4].kedudukan; 
                
                if (!keputusanMengikutKategori[kategori]) keputusanMengikutKategori[kategori] = [];
                
                keputusanMengikutKategori[kategori].push({
                    kategori: kategori,
                    sekolah: sekolahKelas,
                    jumlahPeserta: bilanganPesertaLayak,
                    markah: markahKumpulan, 
                    tieBreaker: tieBreaker 
                });
            }
        }
        
        if (Object.keys(keputusanMengikutKategori).length === 0) return '<p>Tiada pasukan layak (Min. 4 peserta).</p>';

        let htmlOutput = '';

        for (const kategori in keputusanMengikutKategori) {
            const senaraiKeputusan = keputusanMengikutKategori[kategori];
            
            senaraiKeputusan.sort((a, b) => {
                if (a.markah !== b.markah) return a.markah - b.markah; 
                if (a.tieBreaker !== null && b.tieBreaker !== null) return a.tieBreaker - b.tieBreaker; 
                if (a.tieBreaker === null && b.tieBreaker !== null) return 1; 
                if (a.tieBreaker !== null && b.tieBreaker === null) return -1; 
                return 0; 
            });

            htmlOutput += `<h4>== KATEGORI: ${escapeHtml(kategori)} ==</h4>`;
            htmlOutput += '<table>';
            htmlOutput += '<tr><th>RANK</th><th>SEKOLAH</th><th>MARKAH</th><th>TIE-BREAKER (Peserta ke-5)</th><th>JUM. PESERTA</th></tr>';
            
            senaraiKeputusan.forEach((k, index) => {
                const rank = index + 1;
                let rankClass = '';
                if (rank === 1) rankClass = 'rank-1';
                else if (rank === 2) rankClass = 'rank-2';
                else if (rank === 3) rankClass = 'rank-3';

                const tieBreakerDisplay = k.tieBreaker !== null ? k.tieBreaker : '-';

                htmlOutput += `<tr class="${rankClass}">
                    <td>${rank}</td>
                    <td>${escapeHtml(k.sekolah)}</td>
                    <td>${k.markah}</td>
                    <td>${tieBreakerDisplay}</td>
                    <td>${k.jumlahPeserta}</td>
                </tr>`;
            });
            htmlOutput += '</table>';
        }
        return htmlOutput;
    }
}

// ==========================================================
// 2. INISIALISASI & PENGENDALI ACARA
// ==========================================================

const kejohanan = new Kejohanan();

async function handleMuatNaikCSV() {
    if (!isAdmin()) {
        alert('❌ Akses Ditolak.');
        return;
    }
    
    const fileInput = document.getElementById('csv-input');
    const file = fileInput.files[0];
    const statusElement = document.getElementById('csv-status');

    if (!file) {
        statusElement.innerHTML = '<span style="color: red;">Sila pilih fail CSV dahulu.</span>';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const baris = text.split(/\r?\n/); 
        let berjaya = 0;
        let ralat = 0;

        for (let i = 1; i < baris.length; i++) {
            const rawLine = baris[i].trim();
            if (!rawLine) continue;

            // Pembersihan asas: buang quote jika CSV ada quote
            const data = rawLine.split(',').map(d => d.trim().replace(/^"|"$/g, ''));
            
            if (data.length >= 5 && data[0] && data[1]) { 
                try {
                    const p = new Peserta(data[0], data[1], data[2], data[3], data[4]);
                    const exists = kejohanan.senaraiPeserta.some(peserta => peserta.noBadan.trim() === p.noBadan.trim());
                    
                    if (!exists) {
                         if (await kejohanan.daftarPeserta(p)) berjaya++;
                         else ralat++; 
                    } else {
                        ralat++; 
                    }
                } catch (error) {
                    ralat++;
                }
            } else {
                 ralat++;
            }
        }
        statusElement.innerHTML = `<span style="color: green;">Selesai. Berjaya: ${berjaya}, Ralat: ${ralat}.</span>`;
        paparSemuaPeserta(); 
    };
    reader.readAsText(file);
}

// PENGENDALI KEMASUKAN KEDUDUKAN & MASA (OPTIMIZED)
function handleEditCell(e) {
    if (!isAdmin()) return;

    if (e.target.tagName === 'TD' && e.target.hasAttribute('contenteditable') && e.target.classList.contains('edit-cell')) {
        const noBadan = e.target.getAttribute('data-nobadan');
        const field = e.target.getAttribute('data-field'); // 'kedudukan' atau 'masaLarian'
        
        e.target.onblur = async function() {
            let nilaiBaru = e.target.textContent.trim();
            let updated = false;
            
            // Simpan nilai lama untuk revert jika gagal
            const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
            
            if (field === 'kedudukan') {
                if (nilaiBaru === '') updated = await kejohanan.setKedudukan(noBadan, 0);
                else {
                    const val = parseInt(nilaiBaru);
                    if (isNaN(val) || val < 0) {
                        alert('❌ Nombor tidak sah.');
                        e.target.textContent = peserta.kedudukan > 0 ? peserta.kedudukan : '';
                        return;
                    }
                    updated = await kejohanan.setKedudukan(noBadan, val);
                }
            } else if (field === 'masaLarian') {
                if (nilaiBaru === '') updated = await kejohanan.setMasaLarian(noBadan, null);
                else {
                    const val = parseFloat(nilaiBaru);
                    if (isNaN(val) || val <= 0) {
                        alert('❌ Masa tidak sah.');
                        e.target.textContent = peserta.masaLarian !== null ? peserta.masaLarian.toFixed(2) : '';
                        return;
                    }
                    updated = await kejohanan.setMasaLarian(noBadan, val);
                }
            }
            
            if (updated) {
                 // OPTIMASI: Jangan panggil paparSemuaPeserta(). 
                 // Beri feedback visual (Flash Green)
                 e.target.style.backgroundColor = "#d4edda"; // Hijau muda
                 e.target.style.transition = "background-color 0.5s";
                 setTimeout(() => {
                     e.target.style.backgroundColor = ""; 
                 }, 1000);
            } else {
                // Revert jika gagal update database
                alert('Gagal simpan ke database.');
                if (field === 'kedudukan') e.target.textContent = peserta.kedudukan > 0 ? peserta.kedudukan : '';
                if (field === 'masaLarian') e.target.textContent = peserta.masaLarian !== null ? peserta.masaLarian.toFixed(2) : '';
            }
        };
        
        e.target.onkeydown = function(event) {
            const allowedKeys = [8, 9, 37, 39, 46, 13]; // Backspace, Tab, Arrows, Del, Enter
            const isNumber = (event.keyCode >= 48 && event.keyCode <= 57) || (event.keyCode >= 96 && event.keyCode <= 105);

            if (event.keyCode === 13) { // Enter key
                event.preventDefault();
                e.target.blur(); // Trigger onblur to save
                return;
            }

            if (field === 'kedudukan') {
                if (!(isNumber || allowedKeys.includes(event.keyCode))) event.preventDefault();
            } else if (field === 'masaLarian') {
                 // Benarkan titik perpuluhan (190 atau 110)
                 if (!(isNumber || allowedKeys.includes(event.keyCode) || event.keyCode === 190 || event.keyCode === 110)) {
                    event.preventDefault();
                }
            }
        };
    }
}

document.getElementById('result-senarai').addEventListener('click', handleEditCell);

async function handlePadamPeserta() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    const noBadan = prompt("Masukkan No. Badan peserta:");
    if (noBadan) {
        if (await kejohanan.padamPesertaIndividu(noBadan.trim())) {
            alert(`✅ Peserta ${noBadan.trim()} dipadam.`);
            paparSemuaPeserta(); 
        } else {
            alert('❌ Ralat memadam peserta.');
        }
    }
}

// (Fungsi Reset lama ini dikekalkan sebagai sokongan, walaupun butang utama menggunakan handleBackupDanPadam)
async function resetSemuaData() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    if (confirm("❗ AMARAN: Padam SEMUA data?")) {
        if (await kejohanan.resetSemuaData()) {
            alert("✅ Sistem di-reset.");
            paparSemuaPeserta();
            document.getElementById('result-individu').innerHTML = "";
            document.getElementById('result-kumpulan').innerHTML = "";
        } else {
            alert("❌ Gagal reset.");
        }
    }
}

// --- FUNGSI PAPARAN ---

function paparSemuaPeserta() {
    const html = kejohanan.paparSemuaPesertaDalamJadual();
    document.getElementById('result-senarai').innerHTML = html;
    document.getElementById('filterInput').value = ""; 
    filterTable(); 
}

function analisisIndividu() {
    const html = kejohanan.analisisPemenangIndividuKategori();
    document.getElementById('result-individu').innerHTML = html;
}

function analisisKumpulan() {
    const html = kejohanan.analisisPemenangKumpulan();
    document.getElementById('result-kumpulan').innerHTML = html;
}

function filterTable() {
    const filterValue = document.getElementById("filterInput").value.toUpperCase();
    const container = document.getElementById("result-senarai");
    const table = container.querySelector("table");
    if (!table) return; 

    const rows = table.getElementsByTagName("tr");
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        let displayRow = false; 
        const cells = row.getElementsByTagName("td");
        for (let j = 0; j < 5; j++) { 
            let cell = cells[j];
            if (cell && cell.textContent.toUpperCase().indexOf(filterValue) > -1) {
                displayRow = true;
                break; 
            }
        }
        row.style.display = displayRow ? "" : "none";
    }
}

// ==========================================================
// 3. LOG MASUK & NAVIGASI
// ==========================================================

document.getElementById('login-form').addEventListener('submit', handleLogin);

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const statusElement = document.getElementById('login-status');

    statusElement.textContent = '⏳ Log masuk...';
    try {
        await auth.signInWithEmailAndPassword(email, password);
        statusElement.textContent = ''; 
    } catch (error) {
        statusElement.textContent = `❌ Ralat: ${error.message}`;
    }
}

function handleLogout() {
    auth.signOut().then(() => alert('✅ Log keluar berjaya.'));
}

function initializeApplicationView(user) {
    const dataTabButton = document.getElementById('data-tab-btn');
    const analisisTabButton = document.getElementById('analisis-tab-btn');

    if (user) {
        currentUserID = user.uid;
        currentUserRole = user.uid === ADMIN_UID ? 'admin' : 'user';

        document.getElementById('login-container').style.display = 'none';
        document.querySelector('main').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'inline-block'; 
        
        kejohanan.loadDataFromFirestore().then(() => {
            if (currentUserRole === 'admin') {
                dataTabButton.style.display = 'inline-block';
                openMainTab({currentTarget: dataTabButton}, 'data-tab'); 
            } else { 
                dataTabButton.style.display = 'none'; // Sembunyikan tab data drpd user biasa
                openMainTab({currentTarget: analisisTabButton}, 'analisis-tab'); 
            }
        });
    } else {
        currentUserID = null;
        currentUserRole = null;
        document.querySelector('main').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none'; 
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        kejohanan.senaraiPeserta = []; 
    }
}

function openMainTab(evt, tabName) {
    if (tabName === 'data-tab' && !isAdmin()) {
        alert('❌ Akses Ditolak.');
        return;
    }

    const tabcontent = document.getElementsByClassName("main-tab-content");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    const tablinks = document.getElementsByClassName("main-tab-link");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    if(evt && evt.currentTarget) evt.currentTarget.classList.add("active");
    
    if (tabName === 'analisis-tab') {
        const defaultSub = document.querySelector("#analisis-tab .sub-tab-link");
        if (defaultSub) openSubTab({currentTarget: defaultSub}, 'individu-tab', analisisIndividu);
    } else if (tabName === 'data-tab') {
        paparSemuaPeserta();
    }
}

function openSubTab(evt, tabName, analysisFunction = null) {
    const tabcontent = document.getElementsByClassName("sub-tab-content");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    const tablinks = document.getElementsByClassName("sub-tab-link");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    if (evt && evt.currentTarget) evt.currentTarget.classList.add("active");
    
    if (analysisFunction) analysisFunction();
}

// ==========================================================
// 4. FUNGSI ADMIN TAMBAHAN (CETAKAN & BACKUP)
// ==========================================================

// --- FUNGSI CETAKAN ---
function handleCetakKeputusan() {
    const kandungan = document.getElementById('result-senarai').innerHTML;
    cetakTetingkap("KEPUTUSAN PENUH KEJOHANAN", kandungan);
}

function handleCetakAnalisis() {
    // Gabungkan analisis individu dan kumpulan
    const individu = document.getElementById('result-individu').innerHTML;
    const kumpulan = document.getElementById('result-kumpulan').innerHTML;
    
    const kandungan = `
        <h2>KEPUTUSAN INDIVIDU</h2>
        ${individu}
        <div style="page-break-before: always;"></div>
        <h2>KEPUTUSAN PASUKAN</h2>
        ${kumpulan}
    `;
    cetakTetingkap("ANALISIS RASMI KEJOHANAN", kandungan);
}

function cetakTetingkap(tajuk, isiKandungan) {
    const tetingkapCetak = window.open('', '', 'height=800,width=1000');
    
    tetingkapCetak.document.write('<html><head><title>' + tajuk + '</title>');
    // Gaya CSS khusus untuk cetakan supaya jadual cantik
    tetingkapCetak.document.write(`
        <style>
            body { font-family: sans-serif; padding: 20px; }
            h1, h2 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 5px; text-align: left; }
            th { background-color: #f2f2f2; }
            .rank-1 td { background-color: #ffffcc !important; -webkit-print-color-adjust: exact; }
        </style>
    `);
    tetingkapCetak.document.write('</head><body>');
    tetingkapCetak.document.write('<h1>' + tajuk + '</h1>');
    tetingkapCetak.document.write('<p style="text-align:center">Dicetak pada: ' + new Date().toLocaleString() + '</p>');
    tetingkapCetak.document.write(isiKandungan);
    tetingkapCetak.document.write('</body></html>');
    
    tetingkapCetak.document.close();
    tetingkapCetak.print();
}

// 1. FUNGSI PADAM SEMUA (Tanpa Auto Backup)
async function handlePadamSemua() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    
    // Amaran berganda
    if (!confirm("⚠️ AMARAN KERAS:\n\nAdakah anda pasti mahu memadam SEMUA data?\nTindakan ini tidak boleh diundur.")) return;
    if (!confirm("Adakah anda SUDAH memuat turun Backup?\n\nJika belum, sila tekan Cancel dan buat Backup dahulu.")) return;

    try {
        const batch = db.batch();
        const snapshot = await db.collection('peserta').get();
        
        if (snapshot.empty) {
            alert("Tiada data untuk dipadam.");
            return;
        }

        // Firestore batch limit ialah 500. Jika data banyak, kita perlu loop chunk.
        // Untuk sistem sekolah kecil, batch tunggal biasanya cukup, 
        // tapi ini cara selamat jika data < 500.
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        
        // Reset paparan tempatan
        kejohanan.senaraiPeserta = [];
        paparSemuaPeserta();
        document.getElementById('result-individu').innerHTML = "";
        document.getElementById('result-kumpulan').innerHTML = "";

        alert("✅ Semua data telah berjaya dipadam.");

    } catch (error) {
        console.error(error);
        alert("❌ Ralat memadam data: " + error.message);
    }
}

// 2. FUNGSI BACKUP (Muat Turun Fail JSON)
async function handleBackupDownload() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }

    try {
        // Ambil data terkini dari Firestore
        const snapshot = await db.collection('peserta').get();
        if (snapshot.empty) {
            alert("Tiada data untuk di-backup.");
            return;
        }

        const dataPeserta = snapshot.docs.map(doc => doc.data());
        
        // Tukar data jadi string JSON yang cantik
        const jsonString = JSON.stringify(dataPeserta, null, 2);
        
        // Cipta fail Blob
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Cipta elemen link untuk auto-download
        const a = document.createElement('a');
        const tarikh = new Date().toISOString().slice(0,10); // Format YYYY-MM-DD
        a.href = url;
        a.download = `backup_kmdpk_${tarikh}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Bersihkan memory
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`✅ Backup berjaya dimuat turun: backup_kmdpk_${tarikh}.json`);

    } catch (error) {
        console.error(error);
        alert("❌ Ralat membuat backup: " + error.message);
    }
}

// 3. FUNGSI RESTORE (Dari Fail JSON)
async function handleRestoreDariFail() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }

    const fileInput = document.getElementById('backup-file-input');
    const file = fileInput.files[0];

    if (!file) {
        alert("Sila pilih fail backup (.json) dahulu.");
        return;
    }

    if (!confirm("⚠️ Anda pasti mahu restore data dari fail ini?\nData sedia ada akan digabungkan atau ditimpa.")) return;

    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const kandunganFail = e.target.result;
            const dataPeserta = JSON.parse(kandunganFail);
            
            if (!Array.isArray(dataPeserta)) {
                throw new Error("Format fail tidak sah. Mesti array data peserta.");
            }

            // Proses Restore menggunakan Batch
            // Nota: Firestore Batch max 500 operasi. Kita buat loop mudah.
            // Jika data > 500, kita perlu pecahkan batch. 
            // Kod di bawah support sehingga 500 peserta serentak.
            
            const batch = db.batch();
            let count = 0;

            dataPeserta.forEach(p => {
                // Pastikan guna NoBadan sebagai ID dokumen
                if (p.noBadan) {
                    const docRef = db.collection('peserta').doc(p.noBadan.trim());
                    batch.set(docRef, p); // .set() akan overwrite data jika wujud
                    count++;
                }
            });

            await batch.commit();
            
            alert(`✅ Berjaya restore ${count} peserta! Halaman akan dimuat semula.`);
            location.reload();

        } catch (error) {
            console.error(error);
            alert("❌ Ralat memproses fail backup: " + error.message);
        }
    };

    reader.readAsText(file);
}

// ==========================================================
// 5. MULA APLIKASI
// ==========================================================
document.addEventListener("DOMContentLoaded", () => {
    auth.onAuthStateChanged(initializeApplicationView);

    // 2. SAMBUNGKAN BUTANG LOGOUT
    const btnLogout = document.getElementById('logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // 3. Sembunyikan paparan sementara menunggu loading
    const mainContent = document.querySelector('main');
    const footer = document.querySelector('footer');
    
    if (mainContent) mainContent.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none'; // Sembunyi butang logout jika belum login
    
    // Tunjuk form login
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) loginContainer.style.display = 'block';
});

