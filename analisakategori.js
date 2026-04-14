// ==========================================================
// FAIL KHUSUS: ANALISIS PASUKAN MENGIKUT KUMPULAN UMUR
// ==========================================================

function janaAnalisisPasukanKategori(senaraiPeserta) {
    const pesertaSelesai = senaraiPeserta.filter(p => p.kedudukan > 0);
    
    if (pesertaSelesai.length === 0) return '<div class="alert-info">Tiada keputusan direkodkan.</div>';

    // 1. Kumpulkan data mengikut Kumpulan Umur (12, 15, 19) dan Sekolah
    const dataKumpulanUmur = {};

    pesertaSelesai.forEach(p => {
        const umur = p.kategoriUmur.replace(/[^0-9]/g, '');
        const jantina = p.kategoriUmur.toUpperCase().includes('L') ? 'L' : 'P';
        const sekolah = p.sekolahKelas;

        if (!umur) return; 

        if (!dataKumpulanUmur[umur]) {
            dataKumpulanUmur[umur] = {};
        }
        if (!dataKumpulanUmur[umur][sekolah]) {
            dataKumpulanUmur[umur][sekolah] = {
                sekolah: sekolah,
                semuaPeserta: [], 
                lelaki: [],
                perempuan: []
            };
        }

        dataKumpulanUmur[umur][sekolah].semuaPeserta.push(p);
        if (jantina === 'L') {
            dataKumpulanUmur[umur][sekolah].lelaki.push(p);
        } else {
            dataKumpulanUmur[umur][sekolah].perempuan.push(p);
        }
    });

    let htmlOutput = '';
    const sortedUmur = Object.keys(dataKumpulanUmur).sort((a, b) => parseInt(a) - parseInt(b));

    // HELPER FUNCTION: Kalkulator Kombinasi (2L+1P atau 1L+2P)
    function kiraKombinasiTerbaik(lelaki, perempuan) {
        lelaki.sort((a, b) => a.kedudukan - b.kedudukan);
        perempuan.sort((a, b) => a.kedudukan - b.kedudukan);

        let skorA = null, skorB = null;
        let penyumbangA = [], penyumbangB = [];

        // Pilihan A: 2 Lelaki + 1 Perempuan
        if (lelaki.length >= 2 && perempuan.length >= 1) {
            skorA = lelaki[0].kedudukan + lelaki[1].kedudukan + perempuan[0].kedudukan;
            penyumbangA = [lelaki[0], lelaki[1], perempuan[0]];
        }
        
        // Pilihan B: 1 Lelaki + 2 Perempuan
        if (lelaki.length >= 1 && perempuan.length >= 2) {
            skorB = lelaki[0].kedudukan + perempuan[0].kedudukan + perempuan[1].kedudukan;
            penyumbangB = [lelaki[0], perempuan[0], perempuan[1]];
        }

        if (skorA !== null && skorB !== null) {
            return skorA < skorB ? { skor: skorA, penyumbang: penyumbangA, format: "2L+1P" } : { skor: skorB, penyumbang: penyumbangB, format: "1L+2P" };
        } else if (skorA !== null) {
            return { skor: skorA, penyumbang: penyumbangA, format: "2L+1P" };
        } else if (skorB !== null) {
            return { skor: skorB, penyumbang: penyumbangB, format: "1L+2P" };
        }
        return null; 
    }

    // 2. Proses setiap Kumpulan Umur (12, 15, 19)
    sortedUmur.forEach(umur => {
        const senaraiSekolah = dataKumpulanUmur[umur];
        const keputusanPasukan = [];

        for (const namaSekolah in senaraiSekolah) {
            const dataSekolah = senaraiSekolah[namaSekolah];
            
            const kombinasi = kiraKombinasiTerbaik(dataSekolah.lelaki, dataSekolah.perempuan);

            if (kombinasi) {
                // ==========================================
                // LOGIK TIE-BREAKER BARU YANG DIBETULKAN
                // ==========================================
                
                // 1. Tapis keluar 3 orang penyumbang mata daripada senarai semua peserta sekolah ini
                const bakiPeserta = dataSekolah.semuaPeserta.filter(p => !kombinasi.penyumbang.includes(p));
                
                // 2. Susun baki peserta tersebut mengikut kedudukan
                bakiPeserta.sort((a, b) => a.kedudukan - b.kedudukan);
                
                // 3. Ambil peserta teratas daripada "baki peserta" sebagai Tie-Breaker
                const tieBreaker = bakiPeserta.length > 0 ? bakiPeserta[0] : null;
                
                // ==========================================

                keputusanPasukan.push({
                    pasukan: namaSekolah,
                    mata: kombinasi.skor,
                    kombinasi: kombinasi,
                    tieBreaker: tieBreaker,
                    jumlahPenamat: dataSekolah.semuaPeserta.length
                });
            }
        }

        // 3. Susun Kedudukan Pasukan
        keputusanPasukan.sort((a, b) => {
            if (a.mata !== b.mata) return a.mata - b.mata; 
            
            // Logik Tie-Breaker (Jika mata seri, bandingkan kedudukan peserta tambahan)
            if (a.tieBreaker !== null && b.tieBreaker !== null) return a.tieBreaker.kedudukan - b.tieBreaker.kedudukan;
            if (a.tieBreaker !== null && b.tieBreaker === null) return -1; // Pasukan A menang (ada peserta ke-4)
            if (a.tieBreaker === null && b.tieBreaker !== null) return 1;  // Pasukan B menang (ada peserta ke-4)
            return 0;
        });

        // 4. Bina HTML Jadual
        if (keputusanPasukan.length > 0) {
            htmlOutput += `<h4 style="margin-top: 30px; color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 5px;">== KATEGORI UMUR: BAWAH ${umur} TAHUN ==</h4>`;
            htmlOutput += '<table class="table-pemenang" style="margin-top: 10px;">';
            htmlOutput += '<thead><tr><th style="width: 5%;">RANK</th><th style="width: 25%;">PASUKAN/SEKOLAH</th><th style="width: 10%;">MATA</th><th style="width: 35%;">PENYUMBANG MATA (Top 3 Bersyarat)</th><th style="width: 20%;">TIE-BREAKER (Ke-4 Pasukan)</th><th style="width: 5%;">PENAMAT</th></tr></thead><tbody>';
            
            keputusanPasukan.forEach((k, idx) => {
                let tbDisplay = k.tieBreaker !== null ? 
                    `<strong>${window.escapeHtml(k.tieBreaker.namaPenuh)}</strong><br><small>[${window.escapeHtml(k.tieBreaker.kategoriUmur)}] (No.${k.tieBreaker.kedudukan})</small>` : 
                    '<span style="color:red; font-size: 0.85em;">Tiada Peserta Tambahan</span>';
                
                let rankClass = '';
                if (idx === 0) rankClass = 'rank-1';
                else if (idx === 1) rankClass = 'rank-2';
                else if (idx === 2) rankClass = 'rank-3';
                
                let penyumbangHTML = `<strong style="color:#0284c7;"><small>Format: Kombinasi ${k.kombinasi.format}</small></strong><br>`;
                k.kombinasi.penyumbang.forEach(p => {
                    penyumbangHTML += `- ${window.escapeHtml(p.namaPenuh)} [${window.escapeHtml(p.kategoriUmur)}] (No.${p.kedudukan})<br>`;
                });
                
                htmlOutput += `<tr class="${rankClass}">
                    <td style="text-align:center;"><strong>${idx + 1}</strong></td>
                    <td><strong>${window.escapeHtml(k.pasukan)}</strong></td>
                    <td style="text-align:center; font-size:1.3em; color:#d97706;"><strong>${k.mata}</strong></td>
                    <td style="font-size: 0.85em; line-height: 1.4;">${penyumbangHTML}</td>
                    <td style="text-align: center; background-color:#f8f9fa;">${tbDisplay}</td>
                    <td style="text-align: center;">${k.jumlahPenamat}</td>
                </tr>`;
            });
            htmlOutput += '</tbody></table>';
        }
    });

    return htmlOutput === '' ? '<div class="alert-info">Tiada pasukan yang memenuhi syarat (membentuk kombinasi 2L+1P atau 1L+2P) untuk mana-mana kategori umur.</div>' : htmlOutput;
}
