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

const ADMIN_UID = "op36sIcDvOfsJZnYVpxUuGgVg5B2"; // UID Admin untuk kawalan akses

// INISIALISASI FIREBASE
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserRole = null; // 'admin' atau 'user'
let currentUserID = null;

function isAdmin() {
    return currentUserID === ADMIN_UID;
}


// ==========================================================
// 1. MODEL DATA (Classes: Peserta dan Kejohanan)
// ==========================================================

class Peserta {
    // TAMBAH: masaLarian
    constructor(noBadan, namaPenuh, jantina, kategoriUmur, sekolahKelas, docId = null) {
        this.docId = docId; // ID Dokumen Firestore
        this.noBadan = noBadan;
        this.namaPenuh = namaPenuh;
        this.jantina = jantina;
        this.kategoriUmur = kategoriUmur.toUpperCase().trim();
        this.sekolahKelas = sekolahKelas;
        this.kedudukan = 0; // Kedudukan Overall Rank (di set kemudian oleh admin)
        this.masaLarian = null; // Masa Larian (dalam minit, cth: 25.45)
    }

    static fromJSON(data, docId) {
        const p = new Peserta(data.noBadan, data.namaPenuh, data.jantina, data.kategoriUmur, data.sekolahKelas, docId);
        p.kedudukan = data.kedudukan || 0;
        // INISIALISASI masaLarian
        p.masaLarian = data.masaLarian !== undefined ? data.masaLarian : null;
        return p;
    }
}

class Kejohanan {
    constructor() {
        this.senaraiPeserta = [];
        // Tiada loadData() di sini. Data dimuatkan selepas log masuk oleh listener Firebase.
    }

    // --- A. PENGURUSAN PENYIMPANAN KEKEBAL (FIREBASE FIRESTORE) ---

    // Menggantikan loadData() dengan muat turun dari Firestore
    async loadDataFromFirestore() {
        console.log('⏳ Memuatkan data peserta dari Firestore...');
        try {
            const snapshot = await db.collection('peserta').get();
            this.senaraiPeserta = snapshot.docs.map(doc => Peserta.fromJSON(doc.data(), doc.id));
            console.log(`✅ ${this.senaraiPeserta.length} peserta dimuatkan dari Firestore.`);
            paparSemuaPeserta(); // Panggil paparan selepas data dimuatkan
        } catch (error) {
            console.error('❌ Ralat memuatkan data dari Firestore:', error);
            alert('Ralat memuatkan data. Sila semak konsol.');
        }
    }
    
    // Fungsi umum untuk menyimpan perubahan
    async updatePeserta(noBadan, updateData) {
        if (!isAdmin()) {
            console.warn('❌ Akses Ditolak: Hanya Admin boleh menyimpan perubahan data.');
            return false;
        }
        
        const pesertaToUpdate = this.senaraiPeserta.find(p => p.noBadan.trim() === noBadan.trim());
        
        if (!pesertaToUpdate || !pesertaToUpdate.docId) {
            console.error(`❌ Peserta No. Badan ${noBadan} tidak ditemui atau tiada Doc ID.`);
            return false;
        }

        try {
            // Hasilkan data yang akan dihantar ke Firestore
            const firestoreUpdateData = {};
            for (const key in updateData) {
                // Pastikan nilai null dihantar sebagai null, bukan 0 atau string kosong (kecuali untuk kedudukan)
                firestoreUpdateData[key] = updateData[key] === '' ? null : updateData[key];
            }
            
            await db.collection('peserta').doc(pesertaToUpdate.docId).update(firestoreUpdateData);
            
            // Kemas kini model tempatan (diperlukan untuk fungsi analisis segera)
            Object.assign(pesertaToUpdate, updateData);
            
            // Jika kedudukan atau masa berubah, kemas kini paparan semula
            if (updateData.kedudukan !== undefined || updateData.masaLarian !== undefined) {
                 analisisIndividu(); 
            }
            
            console.log(`✅ Peserta ${noBadan} dikemas kini dalam Firestore:`, firestoreUpdateData);
            return true;
        } catch (error) {
            console.error('❌ Ralat mengemas kini peserta dalam Firestore:', error);
            return false;
        }
    }


    // --- B. FUNGSI PENDAFTARAN & KEMASUKAN KEPUTUSAN (DILINDUNGI) ---

    async daftarPeserta(p) {
        if (!isAdmin()) {
            alert('❌ Akses Ditolak: Hanya Admin boleh mendaftar peserta.');
            return false;
        }
        
        const noBadanTrimmed = p.noBadan.trim();
        const exists = this.senaraiPeserta.some(peserta => peserta.noBadan.trim() === noBadanTrimmed);
        
        if (exists) {
            // Kes duplikat dikendalikan oleh fungsi luaran
            return false;
        }
        
        try {
            // Gunakan noBadan sebagai ID dokumen untuk semakan duplikat yang mudah dalam Firestore
            await db.collection('peserta').doc(noBadanTrimmed).set({
                noBadan: p.noBadan,
                namaPenuh: p.namaPenuh,
                jantina: p.jantina,
                kategoriUmur: p.kategoriUmur,
                sekolahKelas: p.sekolahKelas,
                kedudukan: 0,
                masaLarian: null // Set masa awal kepada null
            });

            // Muat semula data dari Firestore untuk mendapatkan docId baru, tetapi untuk kes ini 
            // kita boleh anggap noBadan = docId dan menambahkannya secara tempatan
            p.docId = noBadanTrimmed;
            this.senaraiPeserta.push(p);
            return true;
        } catch (error) {
            console.error('❌ Ralat mendaftar peserta ke Firestore:', error);
            alert(`Ralat: Gagal mendaftar peserta ${noBadanTrimmed}. Sila semak konsol.`);
            return false;
        }
    }
    
    // Menggunakan fungsi updatePeserta yang baru
    async setKedudukan(noBadan, kedudukan) {
        if (!isAdmin()) {
            console.warn('❌ Akses Ditolak: Hanya Admin boleh merekod keputusan.');
            return false;
        }
        
        const kedudukanInt = (kedudukan === '' || isNaN(kedudukan)) ? 0 : Math.max(0, parseInt(kedudukan));
        
        // Jika kedudukan di-reset (0), masa juga perlu di-reset
        const updateData = { kedudukan: kedudukanInt };
        if (kedudukanInt === 0) {
            updateData.masaLarian = null;
        }
        
        return this.updatePeserta(noBadan, updateData);
    }
    
    // FUNGSI BARU: Set Masa Larian
    async setMasaLarian(noBadan, masaLarian) {
        if (!isAdmin()) {
            console.warn('❌ Akses Ditolak: Hanya Admin boleh merekod masa larian.');
            return false;
        }
        
        const masaFloat = (masaLarian === '' || isNaN(masaLarian)) ? null : parseFloat(masaLarian);
        
        if (masaFloat !== null && masaFloat <= 0) {
            console.error('❌ Masa Larian mesti positif.');
            return false;
        }

        return this.updatePeserta(noBadan, { masaLarian: masaFloat });
    }
    
    async padamPesertaIndividu(noBadan) {
        // ... (Kekal sama)
        if (!isAdmin()) {
            alert('❌ Akses Ditolak: Hanya Admin boleh memadam peserta.');
            return false;
        }
        const noBadanTrimmed = noBadan.trim();
        const peserta = this.senaraiPeserta.find(p => p.noBadan.trim() === noBadanTrimmed);
        
        if (!peserta || !peserta.docId) {
            return false;
        }
        
        try {
            await db.collection('peserta').doc(peserta.docId).delete();
            // Kemas kini model tempatan
            this.senaraiPeserta = this.senaraiPeserta.filter(p => p.noBadan.trim() !== noBadanTrimmed);
            return true;
        } catch (error) {
            console.error('❌ Ralat memadam peserta dari Firestore:', error);
            return false;
        }
    }

    async resetSemuaData() {
        // ... (Kekal sama)
        if (!isAdmin()) {
            alert('❌ Akses Ditolak: Hanya Admin boleh reset data.');
            return false;
        }
        
        // Memadam koleksi dalam Firebase perlu dilakukan secara berkumpulan (batch)
        try {
            const batch = db.batch();
            const snapshot = await db.collection('peserta').get();
            
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            
            this.senaraiPeserta = []; // Kosongkan model tempatan
            return true;
        } catch (error) {
            console.error('❌ Ralat memadam koleksi Firestore:', error);
            alert('Ralat memadam data dari Firestore. Sila semak konsol.');
            return false;
        }
    }

    // ----------------------------------------------------------------
    // --- C. LOGIK PEMARKAHAN & ANALISIS (Helper) --- 
    // ----------------------------------------------------------------

    // Dikekalkan untuk analisis individu 
    kiraMarkahIndividuDariKedudukan(kedudukan) {
        // Skema Pemarkahan: 1=10, 2=9, ..., 9=2, 10=1. 
        if (kedudukan >= 1 && kedudukan <= 10) {
            return Math.max(1, 11 - kedudukan);
        }
        return 0; 
    }

    dapatkanPemenangTersusunMengikutKategori() {
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        
        const petaKategori = pesertaSelesai.reduce((acc, peserta) => {
            const kategori = peserta.kategoriUmur;
            if (!acc[kategori]) { acc[kategori] = []; }
            acc[kategori].push(peserta);
            return acc;
        }, {});
        
        for (const kategori in petaKategori) {
            // Susun berdasarkan Kedudukan Overall
            petaKategori[kategori].sort((a, b) => a.kedudukan - b.kedudukan);
        }
        return petaKategori;
    }

    dapatkanPemenangTersusunMengikutKumpulan() {
        // ... (Kekal sama)
        const pesertaSelesai = this.senaraiPeserta.filter(p => p.kedudukan > 0);
        
        const petaKumpulan = pesertaSelesai.reduce((acc, peserta) => {
            const kunciKumpulan = `${peserta.kategoriUmur}|${peserta.sekolahKelas}`; 
            if (!acc[kunciKumpulan]) { acc[kunciKumpulan] = []; }
            acc[kunciKumpulan].push(peserta);
            return acc;
        }, {});
        
        for (const kunci in petaKumpulan) {
            petaKumpulan[kunci].sort((a, b) => a.kedudukan - b.kedudukan);
        }
        return petaKumpulan;
    }

    // ----------------------------------------------------------------
    // --- D. PAPARAN DAN ANALISIS KEPUTUSAN --- 
    // ----------------------------------------------------------------
    
    paparSemuaPesertaDalamJadual() {
        if (this.senaraiPeserta.length === 0) {
            return '<p>Tiada peserta didaftarkan buat masa ini.</p>';
        }

        let htmlOutput = '<table>';
        // TAMBAH: Lajur MASA LARIAN
        htmlOutput += '<tr><th>NO. BADAN</th><th>NAMA PENUH</th><th>JANTINA</th><th>KATEGORI</th><th>PASUKAN</th><th>KEDUDUKAN</th><th>MASA LARIAN (minit)</th></tr>';

        const senaraiTersusun = [...this.senaraiPeserta].sort((a, b) => a.noBadan.localeCompare(b.noBadan)); 

        senaraiTersusun.forEach(p => {
            const kedudukanDisplay = p.kedudukan > 0 ? p.kedudukan : '';
            const masaDisplay = p.masaLarian !== null ? p.masaLarian.toFixed(2) : '';

            // KAWALAN AKSES berdasarkan isAdmin()
            const isEditable = isAdmin() ? `contenteditable="true"` : '';
            const kedudukanCellClass = isAdmin() ? `class="edit-cell kedudukan-cell"` : '';
            // Sel Masa juga boleh diedit
            const masaCellClass = isAdmin() ? `class="edit-cell masa-cell"` : '';

            htmlOutput += `<tr>
                                <td data-nobadan="${p.noBadan}">${p.noBadan}</td>
                                <td>${p.namaPenuh}</td>
                                <td>${p.jantina}</td>
                                <td>${p.kategoriUmur}</td>
                                <td>${p.sekolahKelas}</td>
                                <td ${isEditable} ${kedudukanCellClass} data-nobadan="${p.noBadan}" data-field="kedudukan">${kedudukanDisplay}</td>
                                <td ${isEditable} ${masaCellClass} data-nobadan="${p.noBadan}" data-field="masaLarian">${masaDisplay}</td>
                           </tr>`;
        });
        
        htmlOutput += '</table>';
        htmlOutput += `<p>Jumlah Keseluruhan Peserta: <strong>${this.senaraiPeserta.length}</strong></p>`;
        return htmlOutput;
    }
    
analisisPemenangIndividuKategori() {
        const pemenangKategori = this.dapatkanPemenangTersusunMengikutKategori();
        let htmlOutput = '';

        if (Object.keys(pemenangKategori).length === 0) {
             return '<p>Tiada keputusan larian yang direkodkan (kedudukan > 0) untuk analisis kategori.</p>';
        }

  // FUNGSI UTAMA: Mengira dan Memaparkan Analisis Individu dengan Logik Masa
        for (const kategori in pemenangKategori) {
            const senarai = pemenangKategori[kategori];
            
            // 1. Cari masa kedudukan ke-5 yang sah dalam kategori ini
            let masaRank10 = null;
            // Rank Kategori ke-5 adalah index 4
            const rank5Peserta = senarai.find((p, index) => index === 4 && p.masaLarian !== null);
            
            if (rank5Peserta) {
                masaRank10 = rank5Peserta.masaLarian;
            } else {
                 console.warn(`[Analisis] Tiada Masa Larian direkodkan untuk Rank Kategori ke-5 dalam ${kategori}. Pengiraan automatik tidak boleh dilakukan.`);
            }

            htmlOutput += `<h4>== KATEGORI: ${kategori} (${senarai.length} Peserta Selesai) ==</h4>`;
            
            // Mesej amaran dikekalkan untuk memberitahu Admin untuk memasukkan data
            if (masaRank10 === null && senarai.length >= 5) {
                htmlOutput += `<p style="color:red; font-weight: bold;">⚠️ Sila masukkan MASA LARIAN secara manual untuk Rank Kategori ke-5 untuk membolehkan pengiraan masa automatik.</p>`;
            }
            
            htmlOutput += '<table>';
            // HEADER Dikekalkan: MASA LARIAN (minit)
            htmlOutput += '<tr><th>RANK KATEGORI</th><th>KEDUDUKAN (OVERALL RANK)</th><th>MASA LARIAN (minit)</th><th>NAMA</th><th>SEKOLAH/PASUKAN</th><th>NO. BADAN</th></tr>'; 
            
            for (let i = 0; i < senarai.length; i++) {
                const p = senarai[i];
                const rankKategori = i + 1;
                
                let masaDisplay = '';
                let masaActual = p.masaLarian;
                // let masaSource = 'MANUAL'; // Pemboleh ubah ini tidak lagi digunakan untuk paparan

                // LOGIK PENGIRAAN MASA AUTOMATIK (Untuk Rank Kategori 6 dan ke atas)
                if (rankKategori >= 11) {
                    if (masaRank10 !== null) {
                        masaActual = masaRank10 + ((rankKategori - 10) * 0.03); // T5 + (n-5) * 0.03
                        // masaSource = 'AUTO (+0.03)'; // Pemboleh ubah ini tidak lagi digunakan untuk paparan
                    } else {
                        // masaSource = 'TIADA MASA KATEGORI KE-10'; // Pemboleh ubah ini tidak lagi digunakan untuk paparan
                    }
                }
                
                // PENGUBAHSUAIAN UTAMA DI SINI:
                // Hanya paparkan nilai masa (sehingga 2 titik perpuluhan) tanpa perkataan MANUAL/AUTO.
                if (masaActual !== null) {
                    masaDisplay = masaActual.toFixed(2); // Cuma nilai masa
                } else if (p.kedudukan > 0) {
                    // Paparkan "BELUM DIREKOD" jika kedudukan ada tetapi masa tiada (terutamanya untuk Rank 1-5)
                    masaDisplay = 'BELUM DIREKOD'; 
                }

                htmlOutput += `<tr>
                                    <td>${rankKategori}</td>
                                    <td>${p.kedudukan}</td>
                                    <td>${masaDisplay}</td>
                                    <td>${p.namaPenuh}</td>
                                    <td>${p.sekolahKelas}</td>
                                    <td>${p.noBadan}</td>
                                </tr>`;
            }
            htmlOutput += '</table>';
        }
        return htmlOutput;
    }
    
    analisisPemenangKumpulan() {
        // ... (Kekal sama)
        const petaKumpulan = this.dapatkanPemenangTersusunMengikutKumpulan();
        
        const keputusanMengikutKategori = {};

        for (const kunci in petaKumpulan) {
            const senaraiKumpulan = petaKumpulan[kunci];
            const [kategori, sekolahKelas] = kunci.split('|');
            const bilanganPesertaLayak = senaraiKumpulan.length;
            
            if (bilanganPesertaLayak >= 4) {
                const peserta4Terbaik = senaraiKumpulan.slice(0, 4);
                
                const markahKumpulan = peserta4Terbaik
                    .reduce((sum, p) => sum + p.kedudukan, 0); 
                
                let tieBreaker = null;
                if (bilanganPesertaLayak >= 5) {
                    tieBreaker = senaraiKumpulan[4].kedudukan; 
                }
                
                if (!keputusanMengikutKategori[kategori]) {
                    keputusanMengikutKategori[kategori] = [];
                }
                
                keputusanMengikutKategori[kategori].push({
                    kategori: kategori,
                    sekolah: sekolahKelas,
                    jumlahPeserta: bilanganPesertaLayak,
                    markah: markahKumpulan, 
                    tieBreaker: tieBreaker 
                });
            }
        }
        
        if (Object.keys(keputusanMengikutKategori).length === 0) {
            return '<p>Tiada kumpulan yang layak untuk pemarkahan kumpulan (perlu ≥ 4 peserta dalam gabungan Kategori dan Sekolah/Kelas).</p>';
        }

        let htmlOutput = '';

        // Susun setiap kategori dan paparkan
        for (const kategori in keputusanMengikutKategori) {
            const senaraiKeputusan = keputusanMengikutKategori[kategori];
            
            senaraiKeputusan.sort((a, b) => {
                if (a.markah !== b.markah) {
                    return a.markah - b.markah; 
                }
                
                if (a.tieBreaker !== null && b.tieBreaker !== null) {
                    return a.tieBreaker - b.tieBreaker; 
                }
                if (a.tieBreaker === null && b.tieBreaker !== null) return 1; 
                if (a.tieBreaker !== null && b.tieBreaker === null) return -1; 
                return 0; 
            });

            htmlOutput += `<h4>== KATEGORI: ${kategori} ==</h4>`;
            htmlOutput += '<table>';
            htmlOutput += '<tr><th>RANK</th><th>SEKOLAH/PASUKAN</th><th>MARKAH KUMPULAN (SUM 4 OVERALL RANK TERBAIK)</th><th>PESERTA KE-5 (TIE-BREAKER OVERALL RANK)</th><th>JUMLAH PESERTA LAYAK (≥ 4)</th></tr>';
            
            senaraiKeputusan.forEach((k, index) => {
                const rank = index + 1;
                let rankClass = '';
                if (rank === 1) rankClass = 'rank-1';
                else if (rank === 2) rankClass = 'rank-2';
                else if (rank === 3) rankClass = 'rank-3';

                const tieBreakerDisplay = k.tieBreaker !== null ? k.tieBreaker : 'N/A (Tiada Peserta ke-5)';

                htmlOutput += `<tr class="${rankClass}">
                                    <td>${rank}</td>
                                    <td>${k.sekolah}</td>
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
// 2. INISIALISASI & PENGENDALI ACARA (Event Handlers)
// ==========================================================

const kejohanan = new Kejohanan();

async function handleMuatNaikCSV() {
    // ... (Kekal sama)
    if (!isAdmin()) {
        alert('❌ Akses Ditolak: Hanya Admin boleh muat naik data.');
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
            if (rawLine === '') continue;

            const data = rawLine.split(',').map(d => d.trim());
            
            if (data.length >= 5 && data[0] && data[1]) { 
                try {
                    // Tiada masa dalam CSV, ia akan diset kepada null secara default dalam constructor
                    const p = new Peserta(data[0], data[1], data[2], data[3], data[4]);
                    
                    // Semak duplikat tempatan sebelum cuba mendaftar
                    const exists = kejohanan.senaraiPeserta.some(peserta => peserta.noBadan.trim() === p.noBadan.trim());
                    
                    if (!exists) {
                         if (await kejohanan.daftarPeserta(p)) { 
                            berjaya++;
                        } else {
                            ralat++; 
                        }
                    } else {
                        ralat++; // Duplikat tempatan
                    }

                } catch (error) {
                    console.error("Ralat memproses baris CSV:", rawLine, error);
                    ralat++;
                }
            } else {
                 ralat++;
            }
        }
        statusElement.innerHTML = `<span style="color: green;">Muat naik selesai. Berjaya: ${berjaya}, Ralat (Duplikat/Tidak Lengkap): ${ralat}.</span>`;
        paparSemuaPeserta(); 
    };

    reader.readAsText(file);
}

// PENGENDALI KEMASUKAN KEDUDUKAN & MASA (DIUBAHSUAI)
function handleEditCell(e) {
    if (!isAdmin()) return;

    if (e.target.tagName === 'TD' && e.target.hasAttribute('contenteditable') && e.target.classList.contains('edit-cell')) {
        const noBadan = e.target.getAttribute('data-nobadan');
        const field = e.target.getAttribute('data-field'); // 'kedudukan' atau 'masaLarian'
        
        e.target.onblur = async function() {
            let nilaiBaru = e.target.textContent.trim();
            let updated = false;
            
            if (field === 'kedudukan') {
                if (nilaiBaru === '') {
                    updated = await kejohanan.setKedudukan(noBadan, 0); // Set kedudukan kepada 0
                } else {
                    const kedudukanInt = parseInt(nilaiBaru);
                    
                    if (isNaN(kedudukanInt) || kedudukanInt < 0) {
                        alert('❌ Ralat: Sila masukkan nombor kedudukan positif yang sah (atau kosongkan).');
                        // Pulihkan nilai lama
                        const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
                        e.target.textContent = peserta && peserta.kedudukan > 0 ? peserta.kedudukan : '';
                        return;
                    }
                    updated = await kejohanan.setKedudukan(noBadan, kedudukanInt);
                }
                
            } else if (field === 'masaLarian') {
                if (nilaiBaru === '') {
                    updated = await kejohanan.setMasaLarian(noBadan, null); // Set masa kepada null
                } else {
                    const masaFloat = parseFloat(nilaiBaru);
                    
                    if (isNaN(masaFloat) || masaFloat <= 0) {
                        alert('❌ Ralat: Sila masukkan nombor masa larian positif yang sah (cth: 25.45) atau kosongkan.');
                        // Pulihkan nilai lama
                        const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
                        e.target.textContent = peserta && peserta.masaLarian !== null ? peserta.masaLarian.toFixed(2) : '';
                        return;
                    }
                    updated = await kejohanan.setMasaLarian(noBadan, masaFloat);
                }
            }
            
            if (updated) {
                 console.log(`✅ ${field} No. Badan ${noBadan} dikemas kini kepada ${nilaiBaru || 'null'}`);
                 // Muat semula paparan keseluruhan jadual untuk mengemaskini nilai (sekiranya ada perbezaan format)
                 paparSemuaPeserta();
            } else if (nilaiBaru !== '' && !updated) {
                alert(`Gagal mengemas kini ${field} di Firestore. Sila semak konsol.`);
                // Pulihkan nilai lama jika gagal
                const peserta = kejohanan.senaraiPeserta.find(p => p.noBadan.trim() === noBadan);
                if (field === 'kedudukan') {
                     e.target.textContent = peserta && peserta.kedudukan > 0 ? peserta.kedudukan : '';
                } else if (field === 'masaLarian') {
                    e.target.textContent = peserta && peserta.masaLarian !== null ? peserta.masaLarian.toFixed(2) : '';
                }
            }
        };
        
        // Memastikan hanya nombor dan titik boleh ditaip untuk masa, dan hanya nombor untuk kedudukan
        e.target.onkeydown = function(event) {
            const allowedKeys = [8, 9, 37, 39, 46, 110, 190]; // Backspace, Tab, Arrows, Delete, Decimal/Period
            const isNumber = (event.keyCode >= 48 && event.keyCode <= 57) || (event.keyCode >= 96 && event.keyCode <= 105);

            if (field === 'kedudukan') {
                // Hanya benarkan nombor
                if (!(isNumber || allowedKeys.slice(0, 5).includes(event.keyCode))) {
                    event.preventDefault();
                }
            } else if (field === 'masaLarian') {
                 // Benarkan nombor dan titik (untuk nombor perpuluhan)
                 if (!(isNumber || allowedKeys.includes(event.keyCode))) {
                    event.preventDefault();
                }
                // Pastikan hanya satu titik dibenarkan
                if ((event.keyCode === 110 || event.keyCode === 190) && e.target.textContent.includes('.')) {
                    event.preventDefault();
                }
            }
        };
    }
}

document.getElementById('result-senarai').addEventListener('click', handleEditCell);


// --- FUNGSI PADAM DATA (DILINDUNG) ---
async function handlePadamPeserta() {
    // ... (Kekal sama)
    if (!isAdmin()) {
        alert('❌ Akses Ditolak: Hanya Admin boleh memadam data.');
        return;
    }
    const noBadan = prompt("Sila masukkan No. Badan peserta yang ingin dipadam:");
    if (noBadan) {
        if (await kejohanan.padamPesertaIndividu(noBadan.trim())) {
            alert(`✅ Peserta dengan No. Badan ${noBadan.trim()} berjaya dipadam.`);
            paparSemuaPeserta(); 
        } else {
            alert(`❌ Ralat: Peserta dengan No. Badan ${noBadan.trim()} tidak ditemui atau gagal dipadamkan di Firestore.`);
        }
    }
}

async function resetSemuaData() {
    // ... (Kekal sama)
    if (!isAdmin()) {
        alert('❌ Akses Ditolak: Hanya Admin boleh reset data.');
        return;
    }
    const confirmReset = confirm("❗ AMARAN KERAS: Adakah anda pasti ingin memadam SEMUA rekod peserta dan keputusan? Tindakan ini TIDAK boleh dibatalkan.");

    if (confirmReset) {
        if (await kejohanan.resetSemuaData()) {
            alert("✅ SEMUA data kejohanan telah dipadamkan. Aplikasi di-reset.");
            paparSemuaPeserta();
            
            document.getElementById('result-individu').innerHTML = "<p>Keputusan analisis individu akan dipaparkan di sini.</p>";
            document.getElementById('result-kumpulan').innerHTML = "<p>Keputusan analisis kumpulan akan dipaparkan di sini.</p>";
        } else {
            alert("❌ Gagal mereset semua data di Firestore.");
        }
    }
}


// --- Paparan & Analisis (Boleh Diakses Semua) ---

function paparSemuaPeserta() {
    const html = kejohanan.paparSemuaPesertaDalamJadual();
    document.getElementById('result-senarai').innerHTML = html;
    document.getElementById('filterInput').value = ""; 
    filterTable(); 
}

function analisisIndividu() {
    // Menggunakan fungsi analisis yang telah diubah suai
    const html = kejohanan.analisisPemenangIndividuKategori();
    document.getElementById('result-individu').innerHTML = html;
}

function analisisKumpulan() {
    const html = kejohanan.analisisPemenangKumpulan();
    document.getElementById('result-kumpulan').innerHTML = html;
}

function filterTable() {
    // ... (Kekal sama)
    const filterValue = document.getElementById("filterInput").value.toUpperCase();
    const container = document.getElementById("result-senarai");
    const table = container.querySelector("table");

    if (!table) return; 

    const rows = table.getElementsByTagName("tr");
    
    // Mulakan dari i=1 untuk melangkau header
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        let displayRow = false; 

        // cells[0] hingga cells[4] adalah NoBadan, Nama, Jantina, Kategori, Pasukan
        const cells = row.getElementsByTagName("td");
        
        for (let j = 0; j < 5; j++) { 
            let cell = cells[j];
            if (cell && cell.textContent.toUpperCase().indexOf(filterValue) > -1) {
                displayRow = true;
                break; 
            }
        }

        if (displayRow) {
            row.style.display = ""; 
        } else {
            row.style.display = "none"; 
        }
    }
}


// ==========================================================
// 3. FUNGSI LOG MASUK, LOG KELUAR & NAVIGASI TAB (KAWALAN AKSES FIREBASE)
// ==========================================================

document.getElementById('login-form').addEventListener('submit', handleLogin);

async function handleLogin(e) {
    // ... (Kekal sama)
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const statusElement = document.getElementById('login-status');

    statusElement.textContent = '⏳ Log masuk...';

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        // Semakan status pengguna akan dikendalikan oleh onAuthStateChanged
        statusElement.textContent = ''; 
    } catch (error) {
        statusElement.textContent = `❌ Ralat: ${error.message}`;
        console.error('Login Error:', error);
        document.getElementById('login-password').value = '';
    }
}

function handleLogout() {
    // ... (Kekal sama)
    auth.signOut().then(() => {
        // onAuthStateChanged akan mengendalikan pembersihan UI
        alert('✅ Anda telah log keluar.');
    }).catch((error) => {
        console.error('Logout Error:', error);
        alert('Ralat semasa log keluar.');
    });
}

function initializeApplicationView(user) {
    // ... (Kekal sama)
    const dataTabButton = document.getElementById('data-tab-btn');
    const analisisTabButton = document.getElementById('analisis-tab-btn');

    if (user) {
        currentUserID = user.uid;
        currentUserRole = user.uid === ADMIN_UID ? 'admin' : 'user';

        document.getElementById('login-container').style.display = 'none';
        document.querySelector('main').style.display = 'block';
        document.querySelector('footer').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'block'; 
        
        // Muatkan data dan sediakan paparan berdasarkan peranan
        kejohanan.loadDataFromFirestore().then(() => {
            if (currentUserRole === 'admin') {
                dataTabButton.classList.remove('hidden-tab');
                openMainTab({currentTarget: dataTabButton}, 'data-tab'); 
            } else { // user
                dataTabButton.classList.add('hidden-tab');
                openMainTab({currentTarget: analisisTabButton}, 'analisis-tab'); 
            }
        });

    } else {
        // Log keluar/Tiada Pengguna
        currentUserID = null;
        currentUserRole = null;
        
        document.querySelector('main').style.display = 'none';
        const footer = document.querySelector('footer');
        if (footer) footer.style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none'; 
        
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-status').textContent = '';
        
        // Bersihkan data tempatan (penting)
        kejohanan.senaraiPeserta = []; 
        paparSemuaPeserta(); 
    }
}


function openMainTab(evt, tabName) {
    // ... (Kekal sama)
    if (tabName === 'data-tab' && !isAdmin()) {
        alert('❌ Akses Ditolak: Hanya Admin boleh mengakses tab Pendaftaran & Data.');
        return;
    }

    let i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("main-tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    tablinks = document.getElementsByClassName("main-tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");
    
    if (tabName === 'analisis-tab') {
        const defaultSubTabButton = document.querySelector("#analisis-tab .sub-tab-link");
        if (defaultSubTabButton) {
            openSubTab({currentTarget: defaultSubTabButton}, 'individu-tab', analisisIndividu);
        }
    } else if (tabName === 'data-tab') {
        paparSemuaPeserta();
    }
}


function openSubTab(evt, tabName, analysisFunction = null) {
    // ... (Kekal sama)
    let i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("sub-tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    tablinks = document.getElementsByClassName("sub-tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add("active");
    }
    
    if (analysisFunction) {
        analysisFunction();
    }
}


// 4. KAWALAN KEADAAN AUTENTIKASI FIREBASE (ON STARTUP)
document.addEventListener("DOMContentLoaded", () => {
    // onAuthStateChanged akan dipanggil sebaik sahaja skrip ini dimuatkan
    auth.onAuthStateChanged(initializeApplicationView);

    // Tetapkan rupa awal (sebelum onAuthStateChanged diselesaikan)
    document.querySelector('main').style.display = 'none';
    const footer = document.querySelector('footer');
    if (footer) footer.style.display = 'none';
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = 'none';
    
    document.getElementById('login-container').style.display = 'block';
});





