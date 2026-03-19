const API_URL = import.meta.env.VITE_API_URL

class ApiClient {
    constructor() {
        this.baseUrl = API_URL
        this.idToken = null
    }

    setIdToken(token) {
        this.idToken = token
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`
        const headers = {
            "Content-Type": "application/json",
            ...options.headers,
        }

        if (this.idToken) {
            headers.Authorization = `Bearer ${this.idToken}`
        }

        const config = {
            ...options,
            headers,
        }

        const response = await fetch(url, config)

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                error: "Request failed",
            }))
            throw new Error(error.error || `HTTP ${response.status}`)
        }

        // Handle empty responses
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
            return response.json()
        }

        return response
    }

    // Wiki endpoints
    async getWikis() {
        return this.request("/wikis")
    }

    async createWiki(name) {
        return this.request("/wikis", {
            method: "POST",
            body: JSON.stringify({ name }),
        })
    }

    async getWiki(wikiId) {
        return this.request(`/wikis/${wikiId}`)
    }

    async updateWiki(wikiId, name) {
        return this.request(`/wikis/${wikiId}`, {
            method: "PUT",
            body: JSON.stringify({ name }),
        })
    }

    async deleteWiki(wikiId) {
        return this.request(`/wikis/${wikiId}`, {
            method: "DELETE",
        })
    }

    // Share endpoints
    async getShares(wikiId) {
        return this.request(`/wikis/${wikiId}/shares`)
    }

    async createShare(wikiId, email, accessLevel = "view") {
        return this.request(`/wikis/${wikiId}/shares`, {
            method: "POST",
            body: JSON.stringify({ email, accessLevel }),
        })
    }

    async updateShare(wikiId, userId, accessLevel) {
        return this.request(`/wikis/${wikiId}/shares/${userId}`, {
            method: "PUT",
            body: JSON.stringify({ accessLevel }),
        })
    }

    async deleteShare(wikiId, userId) {
        return this.request(`/wikis/${wikiId}/shares/${userId}`, {
            method: "DELETE",
        })
    }

    async searchUsers(wikiId, query = "") {
        const q = query ? `?query=${encodeURIComponent(query)}` : ""
        return this.request(`/wikis/${wikiId}/users${q}`)
    }

    // Folder endpoints
    async getFolders(wikiId) {
        return this.request(`/wikis/${wikiId}/folders`)
    }

    async createFolder(wikiId, name, parentFolderId = null) {
        return this.request(`/wikis/${wikiId}/folders`, {
            method: "POST",
            body: JSON.stringify({ name, parentFolderId }),
        })
    }

    async getFolder(wikiId, folderId) {
        return this.request(`/wikis/${wikiId}/folders/${folderId}`)
    }

    async updateFolder(wikiId, folderId, data) {
        return this.request(`/wikis/${wikiId}/folders/${folderId}`, {
            method: "PUT",
            body: JSON.stringify(data),
        })
    }

    async deleteFolder(wikiId, folderId) {
        return this.request(`/wikis/${wikiId}/folders/${folderId}`, {
            method: "DELETE",
        })
    }

    // File endpoints
    async getFiles(wikiId, folderId = null) {
        const query = folderId ? `?folderId=${folderId}` : ""
        return this.request(`/wikis/${wikiId}/files${query}`)
    }

    async createFile(
        wikiId,
        name,
        content = "",
        folderId = null,
        parentFileId = null,
    ) {
        return this.request(`/wikis/${wikiId}/files`, {
            method: "POST",
            body: JSON.stringify({ name, content, folderId, parentFileId }),
        })
    }

    async getFile(wikiId, fileId) {
        return this.request(`/wikis/${wikiId}/files/${fileId}`)
    }

    async updateFile(wikiId, fileId, data) {
        return this.request(`/wikis/${wikiId}/files/${fileId}`, {
            method: "PUT",
            body: JSON.stringify(data),
        })
    }

    async deleteFile(wikiId, fileId) {
        return this.request(`/wikis/${wikiId}/files/${fileId}`, {
            method: "DELETE",
        })
    }

    // Image endpoints
    async uploadImage(wikiId, file) {
        // Convert file to base64
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64String = reader.result.split(",")[1]
                resolve(base64String)
            }
            reader.readAsDataURL(file)
        })

        return this.request(`/wikis/${wikiId}/images/upload`, {
            method: "POST",
            body: JSON.stringify({
                filename: file.name,
                data: base64,
                contentType: file.type,
            }),
        })
    }

    async getImageUrl(wikiId, imageId) {
        return this.request(`/wikis/${wikiId}/images/${imageId}`)
    }

    async deleteImage(wikiId, imageId) {
        return this.request(`/wikis/${wikiId}/images/${imageId}`, {
            method: "DELETE",
        })
    }

    // Version endpoints
    async createVersion(wikiId, fileId, content, label) {
        return this.request(`/wikis/${wikiId}/files/${fileId}/versions`, {
            method: "POST",
            body: JSON.stringify({ content, label }),
        })
    }

    async getVersions(wikiId, fileId) {
        return this.request(`/wikis/${wikiId}/files/${fileId}/versions`)
    }

    async getVersion(wikiId, fileId, versionId) {
        // versionId can contain characters (e.g. "#") that must be URL-encoded
        return this.request(
            `/wikis/${wikiId}/files/${fileId}/versions/${encodeURIComponent(
                versionId,
            )}`,
        )
    }

    // Export endpoints
    async exportFile(wikiId, fileId, format = "md") {
        const response = await this.request(
            `/wikis/${wikiId}/files/${fileId}/export?format=${format}`,
        )
        return response
    }

    async exportFolder(wikiId, folderId, format = "zip") {
        const response = await this.request(
            `/wikis/${wikiId}/folders/${folderId}/export?format=${format}`,
        )
        return response
    }

    async exportWiki(wikiId, format = "zip") {
        const response = await this.request(
            `/wikis/${wikiId}/export?format=${format}`,
        )
        return response
    }

    // Admin user management
    async listUsers() {
        return this.request("/admin/users")
    }

    async createUser(email, temporaryPassword, group) {
        return this.request("/admin/users", {
            method: "POST",
            body: JSON.stringify({ email, temporaryPassword, group }),
        })
    }

    async deleteUser(username) {
        return this.request(`/admin/users/${encodeURIComponent(username)}`, {
            method: "DELETE",
        })
    }

    async resetPassword(username, temporaryPassword) {
        return this.request(`/admin/users/${encodeURIComponent(username)}`, {
            method: "PUT",
            body: JSON.stringify({ temporaryPassword }),
        })
    }
}

export const apiClient = new ApiClient()
