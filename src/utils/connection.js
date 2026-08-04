function hasAcceptedConnection(follows, userIdA, userIdB) {
  return (follows || []).some((follow) => {
    const status = String(follow?.status || '').toUpperCase().replace('ACCETED', 'ACCEPTED');
    if (status !== 'ACCEPTED') return false;
    return (
      (follow?.follower_id === userIdA && follow?.following_id === userIdB) ||
      (follow?.follower_id === userIdB && follow?.following_id === userIdA)
    );
  });
}

function resolveFollowStatus(follows, viewerId, targetId) {
  const rows = (follows || []).filter(Boolean);
  const accepted = rows.some((follow) => {
    const status = String(follow?.status || '').toUpperCase().replace('ACCETED', 'ACCEPTED');
    if (status !== 'ACCEPTED') return false;
    return (
      (follow?.follower_id === viewerId && follow?.following_id === targetId) ||
      (follow?.follower_id === targetId && follow?.following_id === viewerId)
    );
  });

  if (accepted) return 'ACCEPTED';

  const pending = rows.find((follow) => {
    const status = String(follow?.status || '').toUpperCase();
    return status === 'PENDING' && follow?.follower_id === viewerId && follow?.following_id === targetId;
  });

  if (pending) return 'PENDING';
  return 'NONE';
}

module.exports = { hasAcceptedConnection, resolveFollowStatus };
