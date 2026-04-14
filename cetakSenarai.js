// ==========================================================
// FAIL KHUSUS: CETAK SENARAI PENDAFTARAN PESERTA
// ==========================================================

function cetakSenaraiPeserta() {
    // 1. Ambil elemen jadual asal dari skrin
    const jadualAsal = document.querySelector('#result-senarai table');
    
    if (!jadualAsal) {
        alert("Tiada data jadual untuk dicetak. Sila pastikan data peserta wujud.");
        return;
    }

    // 2. Clone (salin) jadual supaya kita tidak merosakkan jadual di skrin
    const jadualClone = jadualAsal.cloneNode(true);

    // 3. Buang ciri "contenteditable" supaya ia menjadi teks statik
    const selEdit = jadualClone.querySelectorAll('[contenteditable="true"]');
    selEdit.forEach(sel => {
        sel.removeAttribute('contenteditable');
    });

    // 4. Buang baris (row) yang disembunyikan oleh filter dan kira jumlah sebenar
    const barisJadualClone = jadualClone.querySelectorAll('tr');
    let jumlahPapar = 0;
    
    // Mula dari index 1 untuk abaikan baris Tajuk (Header)
    for (let i = 1; i < barisJadualClone.length; i++) {
        if (barisJadualClone[i].style.display === 'none') {
            barisJadualClone[i].remove(); // Buang terus dari jadual cetakan
        } else {
            jumlahPapar++; // Kira peserta yang dipaparkan sahaja
        }
    }

    // 5. Dapatkan nama kategori/pasukan dari filter untuk dijadikan tajuk laporan
    const kategoriFilter = document.getElementById('filterKategori') ? document.getElementById('filterKategori').value : '';
    const pasukanFilter = document.getElementById('filterPasukan') ? document.getElementById('filterPasukan').value : '';
    
    let tajukTambahan = '';
    if (kategoriFilter) tajukTambahan += ` KATEGORI: ${kategoriFilter} |`;
    if (pasukanFilter) tajukTambahan += ` PASUKAN: ${pasukanFilter}`;
    if (!tajukTambahan) tajukTambahan = " KESELURUHAN";

    // 6. Bina struktur HTML untuk tetingkap cetakan
    const kandungan = `
        <h2 style="text-align: center; font-family: Arial, sans-serif;">SENARAI PESERTA -${tajukTambahan}</h2>
        ${jadualClone.outerHTML}
        <p style="margin-top: 15px; font-size: 14px; font-family: Arial, sans-serif;">
            <strong>Jumlah Peserta Dipaparkan: ${jumlahPapar} orang</strong>
        </p>
    `;

    // 7. Buka tetingkap cetakan (Print Window)
    const tetingkapCetak = window.open('', '', 'height=800,width=1000');
    tetingkapCetak.document.write('<html><head><title>Cetak Senarai Peserta</title>');
    tetingkapCetak.document.write(`
        <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
        </style>
    `);
    tetingkapCetak.document.write('</head><body>');
    tetingkapCetak.document.write(kandungan);
    tetingkapCetak.document.write('<p style="text-align:right; font-size:11px; margin-top: 30px;"><i>Dicetak pada: ' + new Date().toLocaleString() + '</i></p>');
    tetingkapCetak.document.write('</body></html>');
    tetingkapCetak.document.close();
    
    // Beri sedikit masa kepada browser untuk render jadual sebelum papar dialog print
    setTimeout(() => {
        tetingkapCetak.print();
    }, 500);
}
