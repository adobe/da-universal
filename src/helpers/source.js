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
const FORM_TYPES = ['multipart/form-data', 'application/x-www-form-urlencoded', 'text/html'];

function getFormEntries(formData) {
  const entries = {};

  if (formData.get('data')) {
    entries.data = formData.get('data');
  }

  return entries;
}

async function formPutHandler(req) {
  let formData;
  try {
    formData = await req.formData();
  } catch (e) {
    console.log('No form data');
  }
  return formData ? getFormEntries(formData) : null;
}

export default async function putHelper(req, env, daCtx) {
  const contentType = req.headers.get('content-type')?.split(';')[0];

  if (!contentType) return null;

  if (FORM_TYPES.some((type) => type === contentType)) return formPutHandler(req, env, daCtx);

  return undefined;
}
