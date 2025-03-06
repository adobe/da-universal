/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const reqs = {
  localhost: new Request('https://localhost:4712/org/site/folder/content'),
  localhostIndex: new Request('https://localhost:4712/org/site/'),
  content: new Request('https://main--site--org.ue.da.live/folder/content'),
  contentIndex: new Request('https://main--site--org.ue.da.live/'),
  invalid: new Request('https://xyz.ue.da.live/'),
  nonHtmlFile: new Request('https://main--site--org.ue.da.live/folder/content.json'),
  plainFile: new Request('https://main--site--org.ue.da.live/folder/content.plain.html')
};

export default reqs;
