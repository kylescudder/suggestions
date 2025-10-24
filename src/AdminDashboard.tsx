import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { Hourglass, Eye, CheckCircle2, XCircle, Sparkles } from "lucide-react";

export function AdminDashboard() {
    const [selectedStatus, setSelectedStatus] = useState<string>("");
    const suggestions = useQuery(api.suggestions.listByStatus, {
        status: selectedStatus || undefined
    });
    const stats = useQuery(api.suggestions.getStats);
    const updateStatus = useMutation(api.suggestions.updateStatus);

    const handleStatusChange = async (suggestionId: Id<"suggestions">, newStatus: string) => {
        try {
            await updateStatus({ suggestionId, status: newStatus });
            toast.success("Status updated successfully!");
        } catch (error) {
            toast.error("Failed to update status");
            console.error(error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "implemented":
                return "bg-green-500/20 text-green-300 border-green-500/30";
            case "reviewed":
                return "bg-blue-500/20 text-blue-300 border-blue-500/30";
            case "rejected":
                return "bg-red-500/20 text-red-300 border-red-500/30";
            default:
                return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "implemented":
                return <CheckCircle2 className="w-4 h-4" />;
            case "reviewed":
                return <Eye className="w-4 h-4" />;
            case "rejected":
                return <XCircle className="w-4 h-4" />;
            default:
                return <Hourglass className="w-4 h-4" />;
        }
    };

    if (suggestions === undefined || stats === undefined) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white mb-4 flex items-center justify-center gap-2">
                    <Sparkles className="w-7 h-7" />
                    Admin Dashboard
                    <Sparkles className="w-7 h-7" />
                </h1>
                <p className="text-purple-200 text-lg">
                    Manage the magical ideas from your community
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div
                    className={`bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 ${selectedStatus === "" ? "ring-2 ring-purple-400" : ""}`}
                    onClick={() => setSelectedStatus("")}
                >
                    <div className="text-center">
                        <div className="text-2xl font-bold text-white">{stats.all}</div>
                        <div className="text-purple-200 text-sm">All Ideas</div>
                    </div>
                </div>

                <div
                    className={`bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 ${selectedStatus === "pending" ? "ring-2 ring-yellow-400" : ""}`}
                    onClick={() => setSelectedStatus("pending")}
                >
                    <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-300">{stats.pending}</div>
                        <div className="text-purple-200 text-sm flex items-center justify-center gap-1">
                            <Hourglass className="w-4 h-4" /> Pending
                        </div>
                    </div>
                </div>

                <div
                    className={`bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 ${selectedStatus === "reviewed" ? "ring-2 ring-blue-400" : ""}`}
                    onClick={() => setSelectedStatus("reviewed")}
                >
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-300">{stats.reviewed}</div>
                        <div className="text-purple-200 text-sm flex items-center justify-center gap-1">
                            <Eye className="w-4 h-4" /> Reviewed
                        </div>
                    </div>
                </div>

                <div
                    className={`bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 ${selectedStatus === "implemented" ? "ring-2 ring-green-400" : ""}`}
                    onClick={() => setSelectedStatus("implemented")}
                >
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-300">{stats.implemented}</div>
                        <div className="text-purple-200 text-sm flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Implemented
                        </div>
                    </div>
                </div>

                <div
                    className={`bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 cursor-pointer transition-all duration-300 hover:bg-white/20 ${selectedStatus === "rejected" ? "ring-2 ring-red-400" : ""}`}
                    onClick={() => setSelectedStatus("rejected")}
                >
                    <div className="text-center">
                        <div className="text-2xl font-bold text-red-300">{stats.rejected}</div>
                        <div className="text-purple-200 text-sm flex items-center justify-center gap-1">
                            <XCircle className="w-4 h-4" /> Rejected
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Info */}
            <div className="mb-6">
                <p className="text-purple-200 text-center">
                    {selectedStatus ? `Showing ${selectedStatus} suggestions` : "Showing all suggestions"}
                    ({suggestions.length} total)
                </p>
            </div>

            {/* Suggestions List */}
            {suggestions.length === 0 ? (
                <div className="text-center py-12">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 text-white/80" />
                    <p className="text-white text-xl">No magical ideas yet!</p>
                    <p className="text-purple-200">Encourage your community to share their sparks.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {suggestions.map((suggestion) => (
                        <div key={suggestion._id} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 magical-glow">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                    <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5" /> {suggestion.title}
                                    </h3>
                                    <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center gap-1 ${getStatusColor(suggestion.status)}`}>
                      {getStatusIcon(suggestion.status)} {suggestion.status}
                    </span>
                                        <span className="text-purple-200 text-sm">
                      {new Date(suggestion._creationTime).toLocaleDateString()}
                    </span>
                                    </div>
                                    {(suggestion.authorName || suggestion.authorEmail) && (
                                        <p className="text-purple-200 text-sm mb-3">
                                            By: {suggestion.authorName || "Anonymous"}
                                            {suggestion.authorEmail && ` (${suggestion.authorEmail})`}
                                        </p>
                                    )}
                                </div>
                                <div className="ml-4">
                                    <select
                                        value={suggestion.status}
                                        onChange={(e) => handleStatusChange(suggestion._id, e.target.value)}
                                        className="bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 backdrop-blur-sm"
                                    >
                                        <option value="pending" className="bg-gray-800">Pending</option>
                                        <option value="reviewed" className="bg-gray-800">Reviewed</option>
                                        <option value="implemented" className="bg-gray-800">Implemented</option>
                                        <option value="rejected" className="bg-gray-800">Rejected</option>
                                    </select>
                                </div>
                            </div>
                            <p className="text-purple-100 leading-relaxed">{suggestion.description}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}