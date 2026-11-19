package com.tavernduel.game;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Обновление игры с GitHub без переустановки приложения.
 * Скачивает files.txt (список «sha1 путь»), сравнивает со своим и докачивает
 * только изменившиеся файлы. Всё качается во временную папку и подменяется,
 * только если загрузка прошла целиком — полуобновлённой игры не бывает.
 * Чистая Java без Android-классов, поэтому её можно проверить на компьютере.
 */
public class Updater {

    public interface Progress { void update(String text); }

    /** Поставщик встроенного списка файлов (из assets) */
    public interface Bundled { InputStream open() throws IOException; }

    private final String base;      // адрес папки с игрой на GitHub
    private final File dir;         // куда складывать скачанные файлы
    private final Bundled bundled;
    private final Progress progress;

    public Updater(String base, File dir, Bundled bundled, Progress progress) {
        this.base = base;
        this.dir = dir;
        this.bundled = bundled;
        this.progress = progress;
    }

    /** Результат: null — обновлений нет/нет сети, иначе версия, до которой обновились */
    public String run(long deadlineMs) {
        long deadline = System.currentTimeMillis() + deadlineMs;
        try {
            Map<String, String> local = parse(readLocal());
            String remoteText = new String(get(base + "files.txt?t=" + System.currentTimeMillis(), 4000, 6000), "UTF-8");
            Map<String, String> remote = parse(remoteText);
            if (!remote.containsKey("#version")) return null;
            List<String> changed = new ArrayList<String>();
            for (Map.Entry<String, String> e : remote.entrySet()) {
                if (e.getKey().startsWith("#")) continue;
                if (!e.getValue().equals(local.get(e.getKey()))) changed.add(e.getKey());
            }
            if (changed.isEmpty()) {
                if (!remote.get("#version").equals(local.get("#version"))) writeManifest(remoteText);
                return null;
            }
            File staging = new File(dir, ".staging");
            deleteTree(staging);
            int i = 0;
            for (String path : changed) {
                if (System.currentTimeMillis() > deadline) return null;   // не успели — в следующий раз
                i++;
                if (progress != null) progress.update("Загружаем обновление " + remote.get("#version") + "… " + i + " из " + changed.size());
                byte[] data = get(base + path, 5000, 20000);
                File out = new File(staging, path);
                out.getParentFile().mkdirs();
                OutputStream os = new FileOutputStream(out);
                try { os.write(data); } finally { os.close(); }
            }
            for (String path : changed) {                     // всё скачано — подменяем
                File from = new File(staging, path), to = new File(dir, path);
                to.getParentFile().mkdirs();
                if (to.exists()) to.delete();
                if (!from.renameTo(to)) throw new IOException("rename " + path);
            }
            writeManifest(remoteText);
            deleteTree(staging);
            return remote.get("#version");
        } catch (Exception e) {
            return null;   // нет сети или GitHub недоступен — играем тем, что есть
        }
    }

    private String readLocal() throws IOException {
        File f = new File(dir, "files.txt");
        InputStream in = f.exists() ? new FileInputStream(f) : bundled.open();
        try { return new String(readAll(in), "UTF-8"); } finally { in.close(); }
    }

    private void writeManifest(String text) throws IOException {
        dir.mkdirs();
        OutputStream os = new FileOutputStream(new File(dir, "files.txt"));
        try { os.write(text.getBytes("UTF-8")); } finally { os.close(); }
    }

    static Map<String, String> parse(String text) throws IOException {
        Map<String, String> m = new LinkedHashMap<String, String>();
        BufferedReader r = new BufferedReader(new InputStreamReader(new java.io.ByteArrayInputStream(text.getBytes("UTF-8")), "UTF-8"));
        String line;
        while ((line = r.readLine()) != null) {
            line = line.trim();
            int sp = line.indexOf(' ');
            if (sp <= 0) continue;
            String a = line.substring(0, sp), b = line.substring(sp + 1);
            if (a.equals("version")) m.put("#version", b);
            else if (!b.contains("..")) m.put(b, a);
        }
        return m;
    }

    static byte[] get(String url, int connectMs, int readMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(connectMs);
        c.setReadTimeout(readMs);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode() + " " + url);
            InputStream in = c.getInputStream();
            try { return readAll(in); } finally { in.close(); }
        } finally {
            c.disconnect();
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    static void deleteTree(File f) {
        if (!f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
