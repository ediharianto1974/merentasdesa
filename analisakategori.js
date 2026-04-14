// ==========================================================
// FAIL KHUSUS: ANALISIS PASUKAN MENGIKUT KATEGORI
// ==========================================================

function janaAnalisisPasukanKategori(senaraiPeserta) {
    const pesertaSelesai = senaraiPeserta.filter(p => p.kedudukan > 0);
    
    // 1. Asingkan peserta mengikut Kategori Umur
    const petaKategori = pesertaSelesai.reduce((acc, p) => {
        if (!acc[p.kategoriUmur]) acc[p.kategoriUmur] = [];
        acc[p.kategoriUmur].push(p);
        return acc;
    }, {});

    let htmlOutput = '';
    const sortedKategori = Object.keys(petaKategori).sort();
    
    if (sortedKategori.length === 0) return '<div class="alert-info">Tiada keputusan direkodkan.</div>';

    // 2. Proses setiap kategori
    sortedKategori.forEach(kategori => {
        const senaraiKategori = petaKategori[kategori];
        
        // Kumpulkan mengikut pasukan dalam kategori ini
        const petaPasukan = senaraiKategori.reduce((acc, p) => {
            if (!acc[p.sekolahKelas]) acc[p.sekolahKelas] = [];
            acc[p.sekolahKelas].push(p);
            return acc;
        }, {});

        const keputusanPasukan = [];

        for (const pasukan in petaPasukan) {
            const ahli = petaPasukan[pasukan];
            // Susun ahli pasukan mengikut kedudukan (terbaik di atas)
            ahli.sort((a, b) => a.kedudukan - b.kedudukan); 

            // Syarat: Pasukan mesti ada sekurang-kurangnya 3 peserta penamat
            if (ahli.length >= 3) { 
                const mata = ahli[0].kedudukan + ahli[1].kedudukan + ahli[2].kedudukan;
                
                // Guna escapeHtml dari script.js untuk keselamatan
                const penyumbang = `
                    ${window.escapeHtml(ahli[0].namaPenuh)} [${window.escapeHtml(ahli[0].noBadan)}] (No.${ahli[0].kedudukan})<br>
                    ${window.escapeHtml(ahli[1].namaPenuh)} [${window.escapeHtml(ahli[1].noBadan)}] (No.${ahli[1].kedudukan})<br>
                    ${window.escapeHtml(ahli[2].namaPenuh)} [${window.escapeHtml(ahli[2].noBadan)}] (No.${ahli[2].kedudukan})
                `;
                // Peserta ke-4 sebagai Tie-Breaker
                const tieBreaker = ahli.length >= 4 ? ahli[3].kedudukan : null;
                
                keputusanPasukan.push({
                    pasukan: pasukan,
                    mata: mata,
                    penyumbang: penyumbang,
                    tieBreaker: tieBreaker,
                    penamat: ahli.length
                });
            }
        }

        // 3. Susun Kedudukan Pasukan
        keputusanPasukan.sort((a, b) => {
            if (a.mata !== b.mata) return a.mata - b.mata; // Mata terendah di atas
            
            // Logik Tie-Breaker (Jika mata seri)
            if (a.tieBreaker !== null && b.tieBreaker !== null) return a.tieBreaker - b.tieBreaker;
            if (a.tieBreaker !== null && b.tieBreaker === null) return -1; // A menang (ada peserta ke-4)
            if (a.tieBreaker === null && b.tieBreaker !== null) return 1;  // B menang (ada peserta ke-4)
            return 0;
        });

        // 4. Bina HTML Jadual
        if (keputusanPasukan.length > 0) {
            htmlOutput += `<h4 style="margin-top: 30px; color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 5px;">== KATEGORI: ${window.escapeHtml(kategori)} ==</h4>`;
            htmlOutput += '<table class="table-pemenang" style="margin-top: 10px;">';
            htmlOutput += '<thead><tr><th>RANK</th><th>PASUKAN/SEKOLAH</th><th>MATA</th><th>PENYUMBANG MATA (TOP 3)</th><th>TIE-BREAKER (Ke-4)</th><th>PENAMAT</th></tr></thead><tbody>';
            
            keputusanPasukan.forEach((k, idx) => {
                let tbDisplay = k.tieBreaker !== null ? `No. ${k.tieBreaker}` : '<span style="color:red">-</span>';
                let rankClass = '';
                if (idx === 0) rankClass = 'rank-1';
                else if (idx === 1) rankClass = 'rank-2';
                else if (idx === 2) rankClass = 'rank-3';
                
                htmlOutput += `<tr class="${rankClass}">
                    <td style="text-align:center;"><strong>${idx + 1}</strong></td>
                    <td><strong>${window.escapeHtml(k.pasukan)}</strong></td>
                    <td style="text-align:center; font-size:1.2em; color:#d97706;"><strong>${k.mata}</strong></td>
                    <td style="font-size: 0.85em; line-height: 1.4;">${k.penyumbang}</td>
                    <td style="text-align: center; background-color:#f8f9fa;"><strong>${tbDisplay}</strong></td>
                    <td style="text-align: center;">${k.penamat}</td>
                </tr>`;
            });
            htmlOutput += '</tbody></table>';
        }
    });

    return htmlOutput === '' ? '<div class="alert-info">Tiada pasukan yang memenuhi syarat (minima 3 peserta tamat) untuk mana-mana kategori.</div>' : htmlOutput;
}
