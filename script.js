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

let currentUserRole = null; 
let currentUserID = null;

function isAdmin() {
    return currentUserID === ADMIN_UID;
}

// --- HELPER KESELAMATAN (XSS PREVENTION) ---
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
        this.kedudukan = 0; 
        this.masaLarian = null; 
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
        if (!isAdmin()) return false;
        
        const pesertaToUpdate = this.senaraiPeserta.find(p => p.noBadan.trim() === noBadan.trim());
        if (!pesertaToUpdate || !pesertaToUpdate.docId) return false;

        try {
            const firestoreUpdateData = {};
            for (const key in updateData) {
                firestoreUpdateData[key] = updateData[key] === '' ? null : updateData[key];
            }
            await db.collection('peserta').doc(pesertaToUpdate.docId).update(firestoreUpdateData);
            Object.assign(pesertaToUpdate, updateData);
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

        if (isAdmin()) {
            htmlOutput += `
            <div style="text-align: center; margin: 20px 0;">
                <button id="btn-simpan" onclick="simpanSemuaKeputusan()" style="padding: 12px 24px; font-size: 16px; font-weight: bold; background-color: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    💾 Simpan Semua Keputusan
                </button>
                <p style="font-size: 0.8em; color: #666; margin-top: 5px;">*Ingat: Tekan butang ini selepas selesai memasukkan markah.</p>
            </div>
            `;
        }

        return htmlOutput;
    }
    
    analisisPemenangIndividuKategori() {
        const pemenangKategori = this.dapatkanPemenangTersusunMengikutKategori();
        let htmlOutput = '';

        if (Object.keys(pemenangKategori).length === 0) return '<p>Tiada keputusan direkodkan.</p>';

        for (const kategori in pemenangKategori) {
            const senarai = pemenangKategori[kategori];
            
            let masaRank15 = null;
            const rank15Peserta = senarai.find((p, index) => index === 14 && p.masaLarian !== null);
            if (rank15Peserta) masaRank15 = rank15Peserta.masaLarian;

            htmlOutput += `<h4>== KATEGORI: ${escapeHtml(kategori)} ==</h4>`;
            
            if (masaRank15 === null && senarai.length >= 16) {
                htmlOutput += `<p style="color:red; font-size: 0.9em;">⚠️ Sila masukkan masa untuk Rank 15 bagi mengaktifkan pengiraan automatik Rank 16+.</p>`;
            }
            
            htmlOutput += '<table>';
            htmlOutput += '<tr><th>RANK</th><th>OVERALL</th><th>MASA</th><th>NAMA</th><th>SEKOLAH</th><th>NO. BADAN</th></tr>'; 
            
            for (let i = 0; i < senarai.length; i++) {
                const p = senarai[i];
                const rankKategori = i + 1;
                
                let masaDisplay = '';
                let masaActual = p.masaLarian;

                if (rankKategori >= 16 && masaRank15 !== null) {
                    masaActual = masaRank15 + ((rankKategori - 15) * 0.03);
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
    
    // ==========================================================
    // FUNGSI ANALISIS KUMPULAN (TIE-BREAKER GABUNGAN DIPERBAIKI)
    // ==========================================================
    analisisPemenangKumpulan() {
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        
        if (pesertaSelesai.length === 0) {
            return '<div class="alert-info">Tiada data kedudukan dikesan. Sila masukkan kedudukan peserta dan simpan keputusan dahulu.</div>';
        }

        let htmlOutput = '';

        // --- LANGKAH 1: CARI TIE-BREAKER KESELURUHAN (GABUNGAN SEMUA KATEGORI) ---
        const sekolahKeseluruhan = {};
        pesertaSelesai.forEach(p => {
            if (!sekolahKeseluruhan[p.sekolahKelas]) {
                sekolahKeseluruhan[p.sekolahKelas] = { sekolah: p.sekolahKelas, semuaPesertaGabungan: [] };
            }
            sekolahKeseluruhan[p.sekolahKelas].semuaPesertaGabungan.push(p);
        });

        // Susun peserta setiap sekolah dan cari peserta ke-10 (Index 9)
        for (const sek in sekolahKeseluruhan) {
            sekolahKeseluruhan[sek].semuaPesertaGabungan.sort((a, b) => a.kedudukan - b.kedudukan);
            // Peserta ke-10 dari gabungan Kategori 12, 15, 19
            sekolahKeseluruhan[sek].tieBreaker = sekolahKeseluruhan[sek].semuaPesertaGabungan[9] || null; 
        }

        // --- LANGKAH 2: KIRA MATA PASUKAN MENGIKUT KATEGORI ---
        htmlOutput += '<h3 style="color: #17a2b8;">🏆 Keputusan Pasukan (Mengikut Kategori)</h3>';

        const petaKategori = {};
        pesertaSelesai.forEach(p => {
            if (!petaKategori[p.kategoriUmur]) petaKategori[p.kategoriUmur] = {};
            if (!petaKategori[p.kategoriUmur][p.sekolahKelas]) {
                petaKategori[p.kategoriUmur][p.sekolahKelas] = {
                    sekolah: p.sekolahKelas,
                    peserta: [],
                    kategori: p.kategoriUmur
                };
            }
            petaKategori[p.kategoriUmur][p.sekolahKelas].peserta.push(p);
        });

        const mataKeseluruhanSekolah = {}; 

        for (const kategori in petaKategori) {
            htmlOutput += `<h4>== KATEGORI: ${escapeHtml(kategori)} ==</h4>`;
            
            const senaraiPasukan = Object.values(petaKategori[kategori]).map(k => {
                const sortedPeserta = k.peserta.sort((a, b) => a.kedudukan - b.kedudukan);
                const top3 = sortedPeserta.slice(0, 3);
                
                if (top3.length >= 3) {
                    k.markah = top3.reduce((sum, p) => sum + p.kedudukan, 0);
                    k.penyumbangMata = top3;
                    k.layak = true;
                } else {
                    k.layak = false;
                }
                k.jumlahPeserta = sortedPeserta.length;
                return k;
            }).filter(k => k.layak).sort((a, b) => a.markah - b.markah); // Susun markah kategori

            if (senaraiPasukan.length === 0) {
                htmlOutput += '<p class="text-muted">Tiada pasukan yang mempunyai sekurang-kurangnya 3 peserta yang tamat larian bagi kategori ini.</p>';
                continue;
            }

            htmlOutput += `
            <table class="table-pemenang">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Pasukan/Sekolah</th>
                        <th>Mata</th>
                        <th>Penyumbang Mata (Top 3)</th>
                        <th>Penamat</th>
                    </tr>
                </thead>
                <tbody>`;

            senaraiPasukan.forEach((k, index) => {
                const rank = index + 1;
                const rankClass = rank <= 3 ? `rank-${rank}` : '';
                
                // Tambah mata kategori ke dalam Johan Keseluruhan
                if (!mataKeseluruhanSekolah[k.sekolah]) {
                    mataKeseluruhanSekolah[k.sekolah] = { 
                        sekolah: k.sekolah, 
                        markahTotal: 0, 
                        butiran: [],
                        tieBreakerKeseluruhan: sekolahKeseluruhan[k.sekolah].tieBreaker // Link Tie-Breaker di sini
                    };
                }
                mataKeseluruhanSekolah[k.sekolah].markahTotal += k.markah;
                mataKeseluruhanSekolah[k.sekolah].butiran.push(`<b>${escapeHtml(kategori)}</b>: ${k.markah} mata`);

                // Paparan Penyumbang Kategori
                const penyumbangDisplay = k.penyumbangMata.map(p => 
                    `<div style="font-size: 0.85em; margin-bottom: 2px;">
                        ${escapeHtml(p.namaPenuh)} [${escapeHtml(p.noBadan)}] <i>(No.${p.kedudukan})</i>
                    </div>`
                ).join('');

                htmlOutput += `
                    <tr class="${rankClass}">
                        <td>${rank}</td>
                        <td><strong>${escapeHtml(k.sekolah)}</strong></td>
                        <td><strong>${k.markah}</strong></td>
                        <td>${penyumbangDisplay}</td>
                        <td>${k.jumlahPeserta}</td>
                    </tr>`;
            });
            htmlOutput += '</tbody></table>';
        }

        // --- LANGKAH 3: JOHAN KESELURUHAN PASUKAN (GUNAKAN TIE BREAKER) ---
        htmlOutput += '<br><hr style="border-top: 2px dashed #17a2b8;"><br>';
        htmlOutput += '<h3 style="color: #28a745;">🏆 Johan Keseluruhan Pasukan (Agregat Mata)</h3>';
        htmlOutput += '<p style="font-size:0.9em; color:#666;">*Tie-breaker dinilai melalui pencapaian peserta ke-10 gabungan bagi pasukan tersebut.</p>';
        
        const senaraiKeseluruhan = Object.values(mataKeseluruhanSekolah).sort((a, b) => {
            if (a.markahTotal !== b.markahTotal) return a.markahTotal - b.markahTotal; // Markah terendah menang
            
            // JIKA SERI MARKAH, GUNA TIE-BREAKER GABUNGAN
            if (a.tieBreakerKeseluruhan && b.tieBreakerKeseluruhan) {
                return a.tieBreakerKeseluruhan.kedudukan - b.tieBreakerKeseluruhan.kedudukan;
            }
            if (a.tieBreakerKeseluruhan) return -1; // Pasukan A ada orang ke-10, A menang
            if (b.tieBreakerKeseluruhan) return 1;  // Pasukan B ada orang ke-10, B menang
            return 0;
        });

        if (senaraiKeseluruhan.length === 0) {
            htmlOutput += '<p>Tiada data agregat yang cukup untuk dikira.</p>';
        } else {
            htmlOutput += `
            <table class="table-pemenang">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Pasukan/Sekolah</th>
                        <th>Jumlah Mata Keseluruhan</th>
                        <th>Pecahan Mata (Kategori)</th>
                        <th>Tie-Breaker (Peserta Ke-10 Gabungan)</th>
                    </tr>
                </thead>
                <tbody>`;
            
            senaraiKeseluruhan.forEach((k, index) => {
                const rank = index + 1;
                const rankClass = rank <= 3 ? `rank-${rank}` : '';
                
                // Paparan Tie-Breaker untuk jadual Johan Keseluruhan
                const tbDisplay = k.tieBreakerKeseluruhan ? 
                    `${escapeHtml(k.tieBreakerKeseluruhan.namaPenuh)}<br><small>(No.${k.tieBreakerKeseluruhan.kedudukan})</small>` : 
                    '<span style="color:gray; font-size:0.85em;">Tiada 10 Peserta</span>';

                htmlOutput += `
                    <tr class="${rankClass}">
                        <td>${rank}</td>
                        <td><strong>${escapeHtml(k.sekolah)}</strong></td>
                        <td><strong>${k.markahTotal}</strong></td>
                        <td><div style="font-size:0.85em;">${k.butiran.join('<br>')}</div></td>
                        <td>${tbDisplay}</td>
                    </tr>`;
            });
            htmlOutput += '</tbody></table>';
        }

        return htmlOutput;
    }
}

// ==========================================================
// 2. INISIALISASI & PENGENDALI ACARA
// ==========================================================

const kejohanan = new Kejohanan();

async function handleMuatNaikCSV() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    
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

            const data = rawLine.split(',').map(d => d.trim().replace(/^"|"$/g, ''));
            
            if (data.length >= 5 && data[0] && data[1]) { 
                try {
                    const p = new Peserta(data[0], data[1], data[2], data[3], data[4]);
                    const exists = kejohanan.senaraiPeserta.some(peserta => peserta.noBadan.trim() === p.noBadan.trim());
                    
                    if (!exists) {
                         if (await kejohanan.daftarPeserta(p)) berjaya++;
                         else ralat++; 
                    } else { ralat++; }
                } catch (error) { ralat++; }
            } else { ralat++; }
        }
        statusElement.innerHTML = `<span style="color: green;">Selesai. Berjaya: ${berjaya}, Ralat: ${ralat}.</span>`;
        paparSemuaPeserta(); 
    };
    reader.readAsText(file);
}

function handleEditCell(e) {
    if (!isAdmin()) return;

    if (e.target.tagName === 'TD' && e.target.hasAttribute('contenteditable') && e.target.classList.contains('edit-cell')) {
        const field = e.target.getAttribute('data-field'); 
        
        e.target.onkeydown = function(event) {
            const allowedKeys = [8, 9, 37, 39, 46, 13]; 
            const isNumber = (event.keyCode >= 48 && event.keyCode <= 57) || (event.keyCode >= 96 && event.keyCode <= 105);

            if (event.keyCode === 13) { 
                event.preventDefault(); 
                return;
            }

            if (field === 'kedudukan') {
                if (!(isNumber || allowedKeys.includes(event.keyCode))) event.preventDefault();
            } else if (field === 'masaLarian') {
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

async function resetSemuaData() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    if (confirm("❗ AMARAN: Padam SEMUA data?")) {
        if (await kejohanan.resetSemuaData()) {
            alert("✅ Sistem di-reset.");
            paparSemuaPeserta();
            document.getElementById('result-individu').innerHTML = "";
            document.getElementById('result-kumpulan').innerHTML = "";
        } else { alert("❌ Gagal reset."); }
    }
}

// ==========================================================
// --- FUNGSI PAPARAN ---
// ==========================================================

let filterKategoriSemasa = "";
let filterPasukanSemasa = "";
let filterCarianSemasa = "";

function paparSemuaPeserta() {
    const kategoriUnik = [...new Set(kejohanan.senaraiPeserta.map(p => p.kategoriUmur))].sort();
    const pasukanUnik = [...new Set(kejohanan.senaraiPeserta.map(p => p.sekolahKelas))].sort();

    let dropdownHTML = `
        <div style="margin-bottom: 15px; padding: 10px; background-color: #f1f5f9; border-radius: 5px; border: 1px solid #cbd5e1; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <strong>Tapis Paparan: </strong>
            <select id="filterKategori" onchange="kemaskiniFilter()" style="padding: 5px; border-radius: 3px;">
                <option value="">-- SEMUA KATEGORI --</option>
                ${kategoriUnik.map(k => `<option value="${escapeHtml(k)}" ${filterKategoriSemasa === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
            </select>
            <select id="filterPasukan" onchange="kemaskiniFilter()" style="padding: 5px; border-radius: 3px;">
                <option value="">-- SEMUA PASUKAN --</option>
                ${pasukanUnik.map(p => `<option value="${escapeHtml(p)}" ${filterPasukanSemasa === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
            </select>
        </div>
    `;

    const htmlJadual = kejohanan.paparSemuaPesertaDalamJadual();
    document.getElementById('result-senarai').innerHTML = dropdownHTML + htmlJadual;
    kemaskiniFilter(); 
}

function kemaskiniFilter() {
    const dropdownKategori = document.getElementById('filterKategori');
    const dropdownPasukan = document.getElementById('filterPasukan');
    const inputCarian = document.getElementById('filterInput');

    if (dropdownKategori) filterKategoriSemasa = dropdownKategori.value;
    if (dropdownPasukan) filterPasukanSemasa = dropdownPasukan.value;
    if (inputCarian) filterCarianSemasa = inputCarian.value.toUpperCase();

    const container = document.getElementById("result-senarai");
    const table = container.querySelector("table");
    if (!table) return; 

    const rows = table.getElementsByTagName("tr");
    
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        const cells = row.getElementsByTagName("td");
        if (cells.length < 5) continue;

        const rowKategori = cells[3].textContent; 
        const rowPasukan = cells[4].textContent; 
        
        const lepasKategori = (filterKategoriSemasa === "" || rowKategori === filterKategoriSemasa);
        const lepasPasukan = (filterPasukanSemasa === "" || rowPasukan === filterPasukanSemasa);
        
        let lepasCarian = false;
        if (filterCarianSemasa === "") {
            lepasCarian = true;
        } else {
            for (let j = 0; j < 5; j++) { 
                if (cells[j].textContent.toUpperCase().indexOf(filterCarianSemasa) > -1) {
                    lepasCarian = true; break; 
                }
            }
        }
        row.style.display = (lepasKategori && lepasPasukan && lepasCarian) ? "" : "none";
    }
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
                displayRow = true; break; 
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
                dataTabButton.style.display = 'none'; 
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
        alert('❌ Akses Ditolak.'); return;
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

function handleCetakKeputusan() {
    const kandungan = document.getElementById('result-senarai').innerHTML;
    cetakTetingkap("KEPUTUSAN PENUH KEJOHANAN", kandungan);
}

function handleCetakAnalisis() {
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
    tetingkapCetak.document.write(`
        <style>
            body { font-family: sans-serif; padding: 20px; }
            h1, h2, h3, h4 { text-align: center; }
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

async function handlePadamSemua() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    if (!confirm("⚠️ AMARAN KERAS:\n\nAdakah anda pasti mahu memadam SEMUA data?\nTindakan ini tidak boleh diundur.")) return;
    if (!confirm("Adakah anda SUDAH memuat turun Backup?\n\nJika belum, sila tekan Cancel dan buat Backup dahulu.")) return;

    try {
        const batch = db.batch();
        const snapshot = await db.collection('peserta').get();
        if (snapshot.empty) { alert("Tiada data untuk dipadam."); return; }
        snapshot.docs.forEach((doc) => { batch.delete(doc.ref); });
        await batch.commit();
        
        kejohanan.senaraiPeserta = [];
        paparSemuaPeserta();
        document.getElementById('result-individu').innerHTML = "";
        document.getElementById('result-kumpulan').innerHTML = "";
        alert("✅ Semua data telah berjaya dipadam.");
    } catch (error) {
        alert("❌ Ralat memadam data: " + error.message);
    }
}

async function handleBackupDownload() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    try {
        const snapshot = await db.collection('peserta').get();
        if (snapshot.empty) { alert("Tiada data untuk di-backup."); return; }

        const dataPeserta = snapshot.docs.map(doc => doc.data());
        const jsonString = JSON.stringify(dataPeserta, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        const tarikh = new Date().toISOString().slice(0,10); 
        a.href = url;
        a.download = `backup_kmdpk_${tarikh}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`✅ Backup berjaya dimuat turun: backup_kmdpk_${tarikh}.json`);
    } catch (error) {
        alert("❌ Ralat membuat backup: " + error.message);
    }
}

async function handleRestoreDariFail() {
    if (!isAdmin()) { alert('❌ Akses Ditolak.'); return; }
    const fileInput = document.getElementById('backup-file-input');
    const file = fileInput.files[0];

    if (!file) { alert("Sila pilih fail backup (.json) dahulu."); return; }
    if (!confirm("⚠️ Anda pasti mahu restore data dari fail ini?\nData sedia ada akan digabungkan atau ditimpa.")) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const kandunganFail = e.target.result;
            const dataPeserta = JSON.parse(kandunganFail);
            
            if (!Array.isArray(dataPeserta)) throw new Error("Format fail tidak sah.");

            const batch = db.batch();
            let count = 0;

            dataPeserta.forEach(p => {
                if (p.noBadan) {
                    const docRef = db.collection('peserta').doc(p.noBadan.trim());
                    batch.set(docRef, p); 
                    count++;
                }
            });

            await batch.commit();
            alert(`✅ Berjaya restore ${count} peserta! Halaman akan dimuat semula.`);
            location.reload();

        } catch (error) {
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

    const btnLogout = document.getElementById('logout-btn');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);

    const mainContent = document.querySelector('main');
    const footer = document.querySelector('footer');
    
    if (mainContent) mainContent.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none'; 
    
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) loginContainer.style.display = 'block';
});

// ==========================================================
// FUNGSI SIMPAN MANUAL
// ==========================================================
async function simpanSemuaKeputusan() {
    if (!isAdmin()) return;
    
    const btn = document.getElementById('btn-simpan');
    if (btn) {
        btn.innerHTML = "Menyimpan... ⏳";
        btn.disabled = true;
    }

    const tdsKedudukan = document.querySelectorAll('.kedudukan-cell');
    const tdsMasa = document.querySelectorAll('.masa-cell');

    let ralat = 0;
    let berjaya = 0;

    for (let i = 0; i < tdsKedudukan.length; i++) {
        const noBadan = tdsKedudukan[i].getAttribute('data-nobadan');
        const nilaiKedudukan = tdsKedudukan[i].textContent.trim();
        const nilaiMasa = tdsMasa[i].textContent.trim();

        let kedudukanInt = (nilaiKedudukan === '' || isNaN(nilaiKedudukan)) ? 0 : Math.max(0, parseInt(nilaiKedudukan));
        let masaFloat = (nilaiMasa === '' || isNaN(nilaiMasa)) ? null : parseFloat(nilaiMasa);

        const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
        if (peserta) {
            let perluUpdate = false;
            let updateData = {};
            
            if (peserta.kedudukan !== kedudukanInt) { 
                updateData.kedudukan = kedudukanInt; perluUpdate = true; 
            }
            if (peserta.masaLarian !== masaFloat) { 
                updateData.masaLarian = masaFloat; perluUpdate = true; 
            }

            if (perluUpdate) {
                const status = await kejohanan.updatePeserta(noBadan, updateData);
                if (status) berjaya++; 
                else ralat++;
            }
        }
    }

    if (btn) {
        btn.innerHTML = "💾 Simpan Semua Keputusan";
        btn.disabled = false;
    }
    
    alert(`✅ Proses selesai! Data dikemaskini: ${berjaya} | Ralat: ${ralat}`);
    paparSemuaPeserta(); 
}
