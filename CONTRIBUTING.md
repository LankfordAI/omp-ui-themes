# Contributing to omp-ui-themes

## Contributing a theme

1. In omp-ui, open **Settings → Appearance**, pick one of your authored themes, and choose **Share**.
2. Pick 1 to 6 tags, write a description of 1 to 160 characters, optionally give your GitHub username, and confirm you may release the theme under CC0 1.0.
3. **Save theme file** and **Save details file** save the two files a contribution needs.
4. Fork this repository, add both files under `themes/`, and open a pull request. The checks run on their own.

## Files

A theme is two files:

- `themes/<slug>.json`: the theme file.
- `themes/<slug>.details.json`: its tags, description and optional author.

The slug is lowercase words joined by single hyphens, at most 64 characters. A theme pull request adds or changes no other paths.

Do not edit `omp-ui-themes.json` or `omp-ui-themes.v2.json`. The index workflow regenerates them after each merge.

## What the check enforces

- The theme file is plain JSON (no comments or trailing commas), at most 6 MiB, and an omp-ui theme file as produced by **Export**.
- It passes omp-ui's contrast gate. The agent-activity colour must be a green with a hue from 100° to 200°.
- Backdrop data is strict base64, and its declared MIME type matches its bytes. Image backdrops are at most 1 MiB.
- The details file has exactly `format`, `version`, `tags`, `description` and an optional `author`. Every tag is listed in [`tags.json`](tags.json).
- Labels are unique, ignoring case. No theme may be a copy of another (same seeds and same backdrop).
- The repository holds at most 500 themes.
- Changes to `tools/`, `.github/`, `LICENSE` and `LICENSE-CODE` come from maintainers only.

## Run the check yourself

With Node 22, from the repository root:

```sh
node tools/omp-ui-theme-tool.mjs check .
```

It prints `N themes, M errors` and one `path: message` line per error.

## What a reviewer checks

- **Scope:** it is a theme for omp-ui.
- **Rights:** you made the theme and its art, or may release them under CC0. A `port` names its original in the description, and the original's licence allows the port.
- **Content:** nothing hateful or sexual, and no logos or trademarks.
- **Finish:** text stays readable over the backdrop, and animation is calm enough to sit beside a transcript.

## Licence

By contributing, you dedicate the theme file, the details file and their art to the public domain under [CC0-1.0](LICENSE). Attribution cannot survive Export, Duplicate or Edit in omp-ui, so it is not required. The tools and workflows are [MIT](LICENSE-CODE).

## Maintainers

- **New tag:** edit `tags.json` (at most 40 tags) *and* `OFFICIAL_THEME_TAGS` in omp-ui (`packages/core/src/theme-repository-format.ts`). The Share panel offers the new tag only from the next omp-ui release.
- **Featured themes:** edit `featured.json` (at most 12). Featured themes lead both indexes, in the order listed.
- **Tool update:** in an omp-ui checkout, run `npm run themes:build-tool -- <this checkout>/tools/omp-ui-theme-tool.mjs` and commit the output. Pull requests are checked by the base branch's copy, so a new tool takes effect for pull requests opened against the commit that adds it.
- **Indexes out of date:** run the `index` workflow from the Actions tab.
