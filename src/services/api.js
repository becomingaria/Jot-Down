// API client for Jot-Down backend
import { getCurrentSession } from "./auth"

const API_URL = import.meta.env.VITE_API_URL || ""

async function getAuthHeaders() {
    try {
        const session = await getCurrentSession()
        return {
            Authorization: `Bearer ${session.idToken}`,
            "Content-Type": "application/json",
        }
    } catch {
        throw new Error("Not authenticated")
    }
}

async function request(method, path, body = null) {
    const headers = await getAuthHeaders()
    const options = { method, headers }

    if (body) {
        options.body = JSON.stringify(body)
    }

    const res = await fetch(`${API_URL}${path}`, options)
    const data = await res.json()

    if (!res.ok) {
        throw new Error(
            data.error || `Request failed with status ${res.status}`,
        )
    }

    return data
}

// --- Wiki API ---
export const wikiApi = {
    list: () => request("GET", "/wikis"),
    get: (wikiId) => request("GET", `/wikis/${wikiId}`),
    create: (name) => request("POST", "/wikis", { name }),
    update: (wikiId, name) => request("PUT", `/wikis/${wikiId}`, { name }),
    delete: (wikiId) => request("DELETE", `/wikis/${wikiId}`),
}

// --- Share API ---
export const shareApi = {
    list: (wikiId) => request("GET", `/wikis/${wikiId}/shares`),
    create: (wikiId, email, accessLevel = "view") =>
        request("POST", `/wikis/${wikiId}/shares`, { email, accessLevel }),
    update: (wikiId, userId, accessLevel) =>
        request("PUT", `/wikis/${wikiId}/shares/${userId}`, { accessLevel }),
    delete: (wikiId, userId) =>
        request("DELETE", `/wikis/${wikiId}/shares/${userId}`),
}

// --- Folder API ---
export const folderApi = {
    list: (wikiId) => request("GET", `/wikis/${wikiId}/folders`),
    get: (wikiId, folderId) =>
        request("GET", `/wikis/${wikiId}/folders/${folderId}`),
    create: (wikiId, name, parentFolderId = null) =>
        request("POST", `/wikis/${wikiId}/folders`, { name, parentFolderId }),
    update: (wikiId, folderId, data) =>
        request("PUT", `/wikis/${wikiId}/folders/${folderId}`, data),
    delete: (wikiId, folderId) =>
        request("DELETE", `/wikis/${wikiId}/folders/${folderId}`),
}

// --- File API ---
export const fileApi = {
    list: (wikiId, folderId = null) =>
        request(
            "GET",
            `/wikis/${wikiId}/files${folderId ? `?folderId=${folderId}` : ""}`,
        ),
    get: (wikiId, fileId) => request("GET", `/wikis/${wikiId}/files/${fileId}`),
    create: (wikiId, name, content = "", folderId = null) =>
        request("POST", `/wikis/${wikiId}/files`, { name, content, folderId }),
    update: (wikiId, fileId, data) =>
        request("PUT", `/wikis/${wikiId}/files/${fileId}`, data),
    delete: (wikiId, fileId) =>
        request("DELETE", `/wikis/${wikiId}/files/${fileId}`),
    import: (wikiId, name, content, folderId = null) =>
        request("POST", `/wikis/${wikiId}/files/import`, {
            name,
            content,
            folderId,
        }),
}

// --- Image API ---
export const imageApi = {
    upload: async (wikiId, file) => {
        const headers = await getAuthHeaders()
        // Convert file to base64
        const buffer = await file.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

        const res = await fetch(`${API_URL}/wikis/${wikiId}/images/upload`, {
            method: "POST",
            headers,
            body: JSON.stringify({ data: base64, filename: file.name }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Upload failed")
        return data
    },
    getUrl: (wikiId, imageId) =>
        request("GET", `/wikis/${wikiId}/images/${imageId}`),
    downloadUrl: (wikiId, imageId) =>
        `${API_URL}/wikis/${wikiId}/images/${imageId}/download`,
}

// --- Export API ---
export const exportApi = {
    fileAsMd: (wikiId, fileId) =>
        `${API_URL}/wikis/${wikiId}/files/${fileId}/export?format=md`,
    fileAsDocx: (wikiId, fileId) =>
        `${API_URL}/wikis/${wikiId}/files/${fileId}/export?format=docx`,
    folder: (wikiId, folderId) =>
        `${API_URL}/wikis/${wikiId}/folders/${folderId}/export?format=zip`,
    wiki: (wikiId) => `${API_URL}/wikis/${wikiId}/export?format=zip`,
}

// --- Admin API ---
export const adminApi = {
    createUser: (email, temporaryPassword) =>
        request("POST", "/wikis", {
            action: "createUser",
            email,
            temporaryPassword,
        }),
}
