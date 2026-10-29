# UI source and dependencies

The Button, Card, Input, Textarea and Badge component sources are from the official
[shadcn/ui base-nova registry](https://ui.shadcn.com/r/styles/base-nova/button.json).
They are distributed under the [shadcn/ui MIT license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
Local changes resolve the `cn` import to `ui/lib/utils.ts` and add a `data-variant` attribute to Button for styling isolation. The application applies its own violet/lime theme and larger controls for readable Chinese text.

Copyright (c) 2023 shadcn

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

Other runtime dependencies retain their upstream licenses in npm packages.
The standalone userscript preserves bundled license comments during the build.
