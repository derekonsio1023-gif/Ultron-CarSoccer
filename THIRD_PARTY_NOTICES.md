# Third-party notices

Project-owned runtime paths and product identifiers are intentionally generic.
The original names below are retained for attribution and licensing in the
repository. The bot selection menu uses rank labels only.
Browser-only components are omitted from the Android package notices..

## Android networking

Android room admission and signaling use OkHttp 4.12.0 (Square), Okio 3.6.0
(Square), and the Kotlin standard library (JetBrains), under Apache License 2.0.
Their licence and copyright notices are included in `licenses/android-networking.txt`
in the Android package. The browser uses its existing Fetch and WebSocket APIs.

## Historical Dribbling Challenge conversion

Original map by Lethamyr: https://lethamyr.com/maps/139. Permission has been
withdrawn. Its geometry, preview and map-specific notice are excluded from new
web and Android builds. Source fixtures and port research remain historical;
no open-source licence to the original map is granted by this project.

## Mediabunny

- Author: Vanilagy and contributors
- Source: https://github.com/Vanilagy/mediabunny
- Package: `mediabunny` 1.57.0, unmodified
- Licence: Mozilla Public License 2.0, distributed at
  `web/public/licenses/mediabunny.txt` and `/licenses/mediabunny.txt`.
- Complete corresponding source (including `src/`):
  https://registry.npmjs.org/mediabunny/-/mediabunny-1.57.0.tgz

Mediabunny packages locally rendered replay frames and recorded game audio into
MP4 files using browser encoders. It is loaded when an export is requested.

## nipplejs


- Author: Yoann Moinet
- Source: https://github.com/yoannmoinet/nipplejs
- Version: 1.0.4
- Licence: MIT
- Copyright: Copyright (c) 2025 Yoann Moinet <yoann.moinet@gmail.com>

nipplejs provides the mobile touch joystick. Its source and binary forms are
distributed under the following terms:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## RocketSim

- Author: ZealanL
- Source: https://github.com/ZealanL/RocketSim
- Licence: MIT
- Copyright: Copyright (c) 2022 ZealanL
- Local licence copy: `native/vendor/physics-engine/LICENSE`
- Website licence copy: `web/public/licenses/rocketsim.txt`, shipped at
  `/licenses/rocketsim.txt` and linked from the Settings footer.

The upstream source is vendored under `native/vendor/physics-engine/`. Car Soccer
adds a browser bridge and uses a generic runtime module name; those integration
changes do not remove the upstream copyright or licence.

## Box2D

- Author: Erin Catto
- Source: https://github.com/erincatto/box2d (v2.3.1, commit 7e633c4)
- Licence: zlib
- Copyright: Copyright (c) 2006-2013 Erin Catto
- Local licence copy: `native/vendor/box2d/LICENSE.txt`
- Website licence copy: `web/public/licenses/box2d.txt`, shipped at `/licenses/box2d.txt`.

The library sources are vendored under `native/vendor/box2d/` and drive the 2D side-view mode
(`native/sideview/`). Two small changes are marked "car-soccer modification" in the source and listed in
`native/vendor/box2d/README.md`: `b2Body::SetAwake(true)` always resets the sleep timer, and
`b2World::SS_ResetContacts()` rebuilds all contacts before a step.

## Bullet custom-map collision extension

The vendored Bullet subset now includes `btScaledBvhTriangleMeshShape` from
[Bullet 3.24](https://github.com/bulletphysics/bullet3/tree/3.24), by Erwin Coumans.
Its zlib licence and copyright notice remain in both source files. The header
uses relative includes and omits serialization to match this subset; dispatch
and raycast support were restored for custom-map instances. These adaptations
are marked in source.

## Historical Ice Rings conversion

Ice Rings is by Lethamyr: https://lethamyr.com/maps/34. The earlier permission
record in docs/permissions/ice-rings.md was subsequently withdrawn. The map,
preview and map-specific notice are excluded from new web and Android builds.
Remaining source fixtures are not a grant of permission to redistribute it.
Coastal Rings uses independently authored geometry, routes and materials.

## Interface fonts and icons

The interface bundles Lilita One and Archivo from Fontsource under the SIL
Open Font License 1.1, and Phosphor Icons under the MIT License. Original
copyright notices and full licence texts ship with the website in
`web/public/licenses/lilita-one.txt`, `web/public/licenses/archivo.txt`, and
`web/public/licenses/phosphor-icons.txt`.

## flag-icons 7.3.2
Country flags from https://github.com/lipis/flag-icons, copyright Panayiotis Lipiridis. MIT license, included at web/public/assets/flags/LICENSE. Flags are served locally.

## Freestyle development references

The development-only replay bench uses `@rlrml/subtr-actor` 1.2.0, published
under MIT by the [subtr-actor project](https://github.com/rlrml/subtr-actor).
It is not included in the game build. Public replay fixtures are downloaded
locally on request and excluded from version control and game distribution.
Their pinned sources and reference-label provenance are documented in
`docs/freestyle-replay-bench.md` and `web/freestyle-lab/fixtures.json`.

The 116-mechanic inventory references the names in the
[RL Mechanics database](https://0byte-coding.github.io/rocket_league_mechanics/).
Car Soccer's per-mechanic scoring policies and detection analysis are original;
source difficulty ratings and descriptions are not reproduced as game rules.
