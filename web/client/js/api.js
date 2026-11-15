// طبقة الاتصال بالـ API (fetch). تعيد JSON أو ترمي ApiError برسالة عربية مفهومة.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith('/login')) onUnauthorized(data.error);
    throw new ApiError(res.status, data.error || 'حدث خطأ غير متوقع.');
  }
  return data;
}

export const api = {
  config: () => request('GET', '/api/config'),
  login: (student_id, password) => request('POST', '/api/login', { student_id, password }),
  logout: () => request('POST', '/api/logout', {}),
  me: () => request('GET', '/api/me'),
  changePassword: (old_password, new_password) => request('POST', '/api/change-password', { old_password, new_password }),
  dashboard: () => request('GET', '/api/dashboard'),
  plan: (hours) => request('GET', `/api/plan?hours=${encodeURIComponent(hours)}`),
  tasks: () => request('GET', '/api/tasks'),
  addTask: (task) => request('POST', '/api/tasks', task),
  doneTask: (id) => request('PATCH', `/api/tasks/${id}`, { done: true }),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  scenarios: () => request('GET', '/api/gpa/scenarios'),
  saveScenario: (s) => request('POST', '/api/gpa/scenarios', s),
  deleteScenario: (id) => request('DELETE', `/api/gpa/scenarios/${id}`),
  chat: (message) => request('POST', '/api/chat', { message }),
  clearChat: () => request('DELETE', '/api/chat'),
};
