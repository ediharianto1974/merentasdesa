// ==========================================================
// FAIL KHUSUS: RESET KEPUTUSAN PESERTA (ADMIN SAHAJA)
// ==========================================================

async function resetSemuaKeputusan() {
    // 1. Pastikan hanya Admin boleh buat
    if (!typeof isAdmin === 'function' || !isAdmin()) {
        alert("Harap maaf. Hanya Admin yang dibenarkan untuk reset keputusan.");
        return;
    }

    // 2. Amaran berganda untuk mengelakkan salah tekan
    const sah1 = confirm("AWAS: Anda pasti mahu RESET (padam) semua kedudukan dan masa larian?\n\nTindakan ini tidak boleh diundurkan.");
    if (!sah1) return;
    
    const sah2 = confirm("PENGESAHAN TERAKHIR: Data pendaftaran peserta (Nama, Pasukan, Kategori) TIDAK akan dipadam. Hanya markah dikosongkan. Teruskan?");
    if (!sah2) return;

    try {
        // Tukar teks butang supaya pengguna tahu sistem sedang memproses
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) btnReset.innerHTML = "Sila Tunggu... Sedang Reset ⏳";

        // 3. Guna Firebase Batch untuk kemas kini semua data serentak dengan pantas
        const batch = db.batch();
        const snapshot = await db.collection('peserta').get();
        
        snapshot.forEach(doc => {
            // Set kedudukan jadi 0, masaLarian jadi null
            batch.update(doc.ref, {
                kedudukan: 0,
                masaLarian: null
            });
        });

        // 4. Hantar arahan ke Firebase
        await batch.commit();

        alert("BERJAYA! Semua keputusan peserta telah dikosongkan.");
        
        // 5. Muat semula halaman untuk memaparkan jadual yang telah kosong
        window.location.reload(); 

    } catch (error) {
        console.error("Ralat semasa reset keputusan:", error);
        alert("Gagal reset keputusan. Sila semak konsol (F12).");
        
        // Kembalikan butang kepada asal jika ralat
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) btnReset.innerHTML = "⚠️ Reset Keputusan";
    }
}
