# Releasing PoE Helper (automatic updates)

Installed copies of PoE Helper check **github.com/rolcsyvagyok/poe-helper** for a newer release at start and
every 4 hours. They download it in the background and install it on the next restart.
Your friends install once; after that, every release you publish reaches them by itself.

Do steps 1 to 4 once. After that, each new version is step 5 only.

## 1. Create the repository (once)

1. Go to https://github.com/new
2. Repository name: **poe-helper** (it must be exactly this; the app looks there).
3. Choose **Public**, so the app can download releases without a password.
4. Leave "Add a README" unticked. Press **Create repository**.

## 2. Put the code there (once, optional but recommended)

You need Git for Windows (https://git-scm.com/download/win). In the PoE Helper folder, click the
address bar, type `cmd`, press Enter, then run:

```
git init
git add .
git commit -m "PoE Helper 0.7.0"
git branch -M main
git remote add origin https://github.com/rolcsyvagyok/poe-helper.git
git push -u origin main
```

Your settings, filter changes, POESESSID and filters are **not** in this folder (they live in
`%APPDATA%\PoE Helper` and your `My Games` folder), so nothing private is uploaded. `node_modules`
and `dist` are excluded by `.gitignore`.

## 3. Make an upload token (once)

1. Go to https://github.com/settings/personal-access-tokens/new (fine-grained token).
2. Name: `poe-helper releases`. Expiration: whatever you like (you make a new one when it runs out).
3. Repository access: **Only select repositories** → `poe-helper`.
4. Permissions → Repository permissions → **Contents: Read and write**.
5. Press **Generate token** and copy it.
6. In a command window run (paste your token between the quotes):

```
setx GH_TOKEN "github_pat_..."
```

Close that window and open a new one, so it sees the token. Keep the token private.

## 4. Install the build tools (once)

In the PoE Helper folder:

```
npm install
```

## 5. Publish a version (every time)

1. Open `package.json` and raise `"version"`, for example `0.7.0` → `0.7.1`. It must be higher than
   the last release, or nobody gets the update.
2. In the PoE Helper folder run:

```
npm run release
```

This builds `PoE-Helper-Setup-<version>.exe` and uploads it with `latest.yml` (which installed
copies read) to a new release at https://github.com/rolcsyvagyok/poe-helper/releases.
It takes a few minutes the first time.

Optional: on the release page press **Edit** and write what changed. That text is shown to people
when the update is ready.

## For your friends (once)

1. Open https://github.com/rolcsyvagyok/poe-helper/releases/latest
2. Download **PoE-Helper-Setup-x.y.z.exe** and run it.
3. Windows SmartScreen may say "Windows protected your PC" because the installer isn't signed:
   press **More info** → **Run anyway**. This only happens on the first install.

From then on, PoE Helper updates itself. When a new version has downloaded, the app shows
"PoE Helper x.y.z is ready" with **Restart to update**; it's also in the tray menu, and Settings →
Updates has **Check now**. If they ignore it, it installs the next time they quit.

You should install it this way yourself too; the copy started with `Start PoE Helper.cmd` is
for building releases and doesn't update itself.

## If something goes wrong

- **"No release found on GitHub yet"** in Settings → Updates: nothing is published, or the release
  is a draft. Open the release on GitHub and press **Publish release**.
- **`npm run release` says it can't publish / 401 / 403:** the token is missing, expired, or lacks
  "Contents: Read and write" on `poe-helper`. Make a new one (step 3) and open a new command window.
- **Friends don't get the update:** the version in `package.json` wasn't raised, or they run an old
  zip copy instead of the installed app.
