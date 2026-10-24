export const validateSearchIntent = (req, res, next) => {
    const { searchQuery } = req.body;

    if (!searchQuery) {
        return res.status(400).json({
            success: false,
            message: "searchQuery is required",
        });
    }

    if (typeof searchQuery !== "string") {
        return res.status(400).json({
            success: false,
            message: "searchQuery must be a string",
        });
    }

    const cleanedQuery = searchQuery.trim();

    if (!cleanedQuery) {
        return res.status(400).json({
            success: false,
            message: "searchQuery cannot be empty",
        });
    }

    if (cleanedQuery.length > 200) {
        return res.status(400).json({
            success: false,
            message: "searchQuery cannot exceed 200 characters",
        });
    }

    req.body.searchQuery = cleanedQuery;

    next();
};

export default {
    validateSearchIntent,
};