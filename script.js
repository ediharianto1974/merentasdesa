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

        // ==========================================
        // MULA TAMBAH BUTANG SIMPAN DI SINI
        // ==========================================
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
        // ==========================================
        // TAMAT TAMBAHAN BUTANG
        // ==========================================

        return htmlOutput;
    }
    
analisisPemenangIndividuKategori() {
        const pemenangKategori = this.dapatkanPemenangTersusunMengikutKategori();
        let htmlOutput = '';

        if (Object.keys(pemenangKategori).length === 0) return '<p>Tiada keputusan direkodkan.</p>';

        for (const kategori in pemenangKategori) {
            const senarai = pemenangKategori[kategori];
            
            // --- PERUBAHAN DI SINI: RUJUK RANK 15 (Index 14) ---
            let masaRank15 = null;
            const rank15Peserta = senarai.find((p, index) => index === 14 && p.masaLarian !== null);
            if (rank15Peserta) masaRank15 = rank15Peserta.masaLarian;

            htmlOutput += `<h4>== KATEGORI: ${escapeHtml(kategori)} ==</h4>`;
            
            // Amaran jika Rank 15 tiada masa tapi ada peserta Rank 16+
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

                // --- PERUBAHAN DI SINI: MULA AUTO DARI RANK 16 MENGGUNAKAN MASA RANK 15 ---
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
    
analisisPemenangKumpulan() {
        // Ambil semua peserta yang menamatkan larian sahaja
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        
        // 1. Kumpulkan semua peserta mengikut sekolah/pasukan
        const petaPasukan = pesertaSelesai.reduce((acc, peserta) => {
            const pasukan = peserta.sekolahKelas;
            if (!acc[pasukan]) acc[pasukan] = [];
            acc[pasukan].push(peserta);
            return acc;
        }, {});

        const keputusanPasukan = [];

        // Fungsi pembantu (helper) diubah suai untuk memulangkan markah BESERTA objek peserta
        const kiraMarkahUmur = (lelaki, perempuan) => {
            let kombA = null; // Kombinasi A: 2 Lelaki + 1 Perempuan
            if (lelaki.length >= 2 && perempuan.length >= 1) {
                kombA = {
                    markah: lelaki[0].kedudukan + lelaki[1].kedudukan + perempuan[0].kedudukan,
                    peserta: [lelaki[0], lelaki[1], perempuan[0]] // Simpan identiti peserta
                };
            }

            let kombB = null; // Kombinasi B: 1 Lelaki + 2 Perempuan
            if (lelaki.length >= 1 && perempuan.length >= 2) {
                kombB = {
                    markah: lelaki[0].kedudukan + perempuan[0].kedudukan + perempuan[1].kedudukan,
                    peserta: [lelaki[0], perempuan[0], perempuan[1]] // Simpan identiti peserta
                };
            }

            // Pilih kombinasi dengan markah terendah (terbaik)
            if (kombA !== null && kombB !== null) return (kombA.markah < kombB.markah) ? kombA : kombB;
            if (kombA !== null) return kombA; 
            if (kombB !== null) return kombB; 
            return null; // Gagal sediakan kombinasi sah
        };

        // 2. Analisis setiap pasukan secara individu
        for (const pasukan in petaPasukan) {
            const senarai = petaPasukan[pasukan];
            
            // Susun keseluruhan ahli pasukan mengikut kedudukan
            senarai.sort((a, b) => a.kedudukan - b.kedudukan);

            const L12 = senarai.filter(p => p.kategoriUmur === 'L12');
            const P12 = senarai.filter(p => p.kategoriUmur === 'P12');
            const L15 = senarai.filter(p => p.kategoriUmur === 'L15');
            const P15 = senarai.filter(p => p.kategoriUmur === 'P15');
            const L19 = senarai.filter(p => p.kategoriUmur === 'L19');
            const P19 = senarai.filter(p => p.kategoriUmur === 'P19');

            const hasil12 = kiraMarkahUmur(L12, P12);
            const hasil15 = kiraMarkahUmur(L15, P15);
            const hasil19 = kiraMarkahUmur(L19, P19);

            // 3. Syarat Utama: Wajib ada markah (dan penyumbang) bagi ke-3 peringkat umur
            if (hasil12 !== null && hasil15 !== null && hasil19 !== null) {
                const jumlahMarkah = hasil12.markah + hasil15.markah + hasil19.markah;
                
                // Gabungkan kesemua 9 penyumbang markah
                const senaraiPenyumbang = [...hasil12.peserta, ...hasil15.peserta, ...hasil19.peserta];

                // Cari kedudukan peserta ke-10
                let tieBreakerVal = null;
                let pesertaTieBreaker = null;
                if (senarai.length >= 10) {
                    pesertaTieBreaker = senarai[9]; // Objek peserta ke-10
                    tieBreakerVal = pesertaTieBreaker.kedudukan;
                }

                keputusanPasukan.push({
                    sekolah: pasukan,
                    markah: jumlahMarkah,
                    tieBreaker: tieBreakerVal,
                    jumlahPeserta: senarai.length,
                    penyumbang: senaraiPenyumbang,
                    pesertaKe10: pesertaTieBreaker
                });
            }
        }

        if (keputusanPasukan.length === 0) {
            return '<p>Tiada pasukan yang layak. (Syarat: Lengkap peserta 12, 15, dan 19 tahun dengan kombinasi L/P yang sah).</p>';
        }

        // 4. Susun senarai keputusan dari Johan ke bawah
        keputusanPasukan.sort((a, b) => {
            if (a.markah !== b.markah) return a.markah - b.markah;
            if (a.tieBreaker !== null && b.tieBreaker !== null) return a.tieBreaker - b.tieBreaker;
            if (a.tieBreaker === null && b.tieBreaker !== null) return 1;  
            if (a.tieBreaker !== null && b.tieBreaker === null) return -1; 
            return 0; 
        });

        // 5. Jana paparan (HTML Output) dengan elemen penyumbang
        let htmlOutput = `<h4>== KEPUTUSAN PASUKAN TERBAIK KESELURUHAN ==</h4>`;
        htmlOutput += '<table style="width: 100%; border-collapse: collapse;">';
        htmlOutput += '<tr><th>RANK</th><th>PASUKAN / SEKOLAH & PENYUMBANG MATA</th><th>MARKAH</th><th>TIE-BREAKER</th><th>JUM. PESERTA</th></tr>';
        
        keputusanPasukan.forEach((k, index) => {
            const rank = index + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'rank-1';
            else if (rank === 2) rankClass = 'rank-2';
            else if (rank === 3) rankClass = 'rank-3';

            // --- JANA HTML UNTUK SENARAI PENYUMBANG ---
            let htmlPenyumbang = `<div style="font-size: 0.85em; margin-top: 10px; color: #444; text-align: left; background: rgba(255,255,255,0.5); padding: 8px; border-radius: 4px;">`;
            htmlPenyumbang += `<strong style="color: #000;">9 Penyumbang Mata Utama:</strong><ul style="margin: 5px 0 10px 0; padding-left: 20px;">`;
            
            // Susun nama penyumbang ikut kategori supaya lebih kemas dibaca
            k.penyumbang.sort((a, b) => a.kategoriUmur.localeCompare(b.kategoriUmur));
            
            k.penyumbang.forEach(p => {
                htmlPenyumbang += `<li>[${p.kategoriUmur}] ${escapeHtml(p.namaPenuh)} <strong>(Ke-${p.kedudukan})</strong></li>`;
            });
            htmlPenyumbang += `</ul>`;

            // Tambah info peserta ke-10 di bawah penyumbang
            if (k.pesertaKe10) {
                htmlPenyumbang += `<div style="color: #27ae60;"><strong>Peserta Ke-10 (Pemutus Seri):</strong><br> [${k.pesertaKe10.kategoriUmur}] ${escapeHtml(k.pesertaKe10.namaPenuh)} <strong>(Ke-${k.pesertaKe10.kedudukan})</strong></div>`;
            } else {
                htmlPenyumbang += `<div style="color: #c0392b;"><em>Tiada peserta ke-10 (Tiada kelebihan Tie-Breaker)</em></div>`;
            }
            htmlPenyumbang += `</div>`;
            // ------------------------------------------

            const tieBreakerDisplay = k.tieBreaker !== null ? k.tieBreaker : '-';

            htmlOutput += `<tr class="${rankClass}">
                <td style="vertical-align: top; padding-top: 15px;">${rank}</td>
                <td style="vertical-align: top;">
                    <strong style="font-size: 1.1em;">${escapeHtml(k.sekolah)}</strong>
                    ${htmlPenyumbang}
                </td>
                <td style="vertical-align: top; padding-top: 15px;"><strong style="font-size: 1.3em;">${k.markah}</strong></td>
                <td style="vertical-align: top; padding-top: 15px;">${tieBreakerDisplay}</td>
                <td style="vertical-align: top; padding-top: 15px;">${k.jumlahPeserta}</td>
            </tr>`;
        });
        htmlOutput += '</table>';

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
        const field = e.target.getAttribute('data-field'); // 'kedudukan' atau 'masaLarian'
        
        // Bagian onblur (auto-save) telah dihapus sepenuhnya di sini.
        
        e.target.onkeydown = function(event) {
            const allowedKeys = [8, 9, 37, 39, 46, 13]; // Backspace, Tab, Arrows, Del, Enter
            const isNumber = (event.keyCode >= 48 && event.keyCode <= 57) || (event.keyCode >= 96 && event.keyCode <= 105);

            if (event.keyCode === 13) { // Tombol Enter
                event.preventDefault(); // Mencegah tombol enter membuat baris baru di dalam kotak
                return;
            }

            // Validasi agar hanya angka yang bisa diketik
            if (field === 'kedudukan') {
                if (!(isNumber || allowedKeys.includes(event.keyCode))) event.preventDefault();
            } else if (field === 'masaLarian') {
                 // Izinkan angka dan titik desimal (key code 190 atau 110)
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

// ==========================================================
// --- FUNGSI PAPARAN ---
// ==========================================================

// 1. Wujudkan pembolehubah memori untuk simpan keadaan tapisan
let filterKategoriSemasa = "";
let filterPasukanSemasa = "";
let filterCarianSemasa = "";

function paparSemuaPeserta() {
    // Bina senarai unik Kategori dan Pasukan dari data sedia ada
    const kategoriUnik = [...new Set(kejohanan.senaraiPeserta.map(p => p.kategoriUmur))].sort();
    const pasukanUnik = [...new Set(kejohanan.senaraiPeserta.map(p => p.sekolahKelas))].sort();

    // Bina kotak tapisan (Dropdown) secara automatik menggunakan HTML
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

    // Ambil jadual asal
    const htmlJadual = kejohanan.paparSemuaPesertaDalamJadual();
    
    // Cantumkan dropdown dan jadual ke dalam skrin
    document.getElementById('result-senarai').innerHTML = dropdownHTML + htmlJadual;
    
    // Wajib panggil fungsi filter untuk pastikan jadual ditapis mengikut dropdown yang dipilih
    kemaskiniFilter(); 
}

function kemaskiniFilter() {
    // Simpan pilihan terkini ke dalam memori
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
    
    // Mula tapis baris (skip baris 0 sebab ia adalah tajuk table)
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        const cells = row.getElementsByTagName("td");
        
        if (cells.length < 5) continue;

        // Dalam jadual kita: Kategori di lajur ke-4 (index 3), Pasukan di lajur ke-5 (index 4)
        const rowKategori = cells[3].textContent; 
        const rowPasukan = cells[4].textContent; 
        
        // Semak syarat tapisan dropdown
        const lepasKategori = (filterKategoriSemasa === "" || rowKategori === filterKategoriSemasa);
        const lepasPasukan = (filterPasukanSemasa === "" || rowPasukan === filterPasukanSemasa);
        
        // Semak syarat carian teks bebas
        let lepasCarian = false;
        if (filterCarianSemasa === "") {
            lepasCarian = true;
        } else {
            for (let j = 0; j < 5; j++) { 
                if (cells[j].textContent.toUpperCase().indexOf(filterCarianSemasa) > -1) {
                    lepasCarian = true;
                    break; 
                }
            }
        }

        // Paparkan hanya jika lepasi ketiga-tiga syarat
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

    // Ambil semua kotak kedudukan dan masa dari jadual
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

        // Semak jika ada perubahan data untuk jimatkan kuota Firebase
        const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
        if (peserta) {
            let perluUpdate = false;
            let updateData = {};
            
            if (peserta.kedudukan !== kedudukanInt) { 
                updateData.kedudukan = kedudukanInt; 
                perluUpdate = true; 
            }
            if (peserta.masaLarian !== masaFloat) { 
                updateData.masaLarian = masaFloat; 
                perluUpdate = true; 
            }

            // Jika ada perubahan, baru kita hantar ke pangkalan data
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
    paparSemuaPeserta(); // Segarkan semula jadual
}

